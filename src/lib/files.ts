/**
 * Shared file-archive utilities used by:
 *   src/pages/files/index.astro
 *   src/pages/files/[...path].astro
 *   src/pages/api/files-feed.json.ts
 *
 * import.meta.glob is resolved relative to THIS file (src/lib/), so the
 * path ../../public/files/** correctly reaches the project-root public/files/.
 */

import fs from 'node:fs';
import nodePath from 'node:path';

// Build-time manifest — present in the Lambda bundle even though the actual
// files live on CloudFront and are absent from the Lambda's filesystem.
export const GLOB_FILES = import.meta.glob(
  '../../public/files/**/*',
  { eager: true, as: 'url' },
) as Record<string, string>;

export const SKIP = /^\.|\.html$|\.php$|^api$|^web\.config$/i;

export const MEATLOAF_EXTS = new Set([
  '.d64', '.d71', '.d81', '.d82', '.prg', '.crt', '.tap', '.t64', '.p00', '.sid',
]);

/** Strip everything up to and including /public/files/ from a glob key. */
export function normKey(key: string): string {
  return key.replace(/^.*?\/public\/files\//, '');
}

/** relPath → CDN URL map (populated at build time). */
export const GLOB_MAP = new Map<string, string>(
  Object.entries(GLOB_FILES).map(([k, v]) => [normKey(k), v]),
);

export interface DirEntry {
  name:  string;
  isDir: boolean;
  size:  number;   // 0 for directories or when unavailable
}

/**
 * Returns the direct children of subPath as a Map<name, isDir>.
 * Pass "" for the root listing.
 */
export function getChildNames(subPath: string): Map<string, boolean> {
  const prefix = subPath ? subPath + '/' : '';
  const result = new Map<string, boolean>();
  for (const key of Object.keys(GLOB_FILES)) {
    const rel = normKey(key);
    if (!rel.startsWith(prefix)) continue;
    const rest = rel.slice(prefix.length);
    if (!rest) continue;
    const slash = rest.indexOf('/');
    const name  = slash === -1 ? rest : rest.slice(0, slash);
    if (name && !SKIP.test(name)) result.set(name, slash !== -1);
  }
  return result;
}

/** Returns true when subPath is a known directory prefix in the manifest. */
export function pathExists(subPath: string): boolean {
  if (!subPath) return true;
  const prefix = subPath + '/';
  return Object.keys(GLOB_FILES).some(k => normKey(k).startsWith(prefix));
}

export function findFilesRoot(): string | null {
  for (const p of [
    nodePath.join(process.cwd(), 'public', 'files'),
    nodePath.join(process.cwd(), 'files'),
  ]) {
    try { if (fs.statSync(p).isDirectory()) return p; } catch {}
  }
  return null;
}

/**
 * Build a sorted entry list for subPath.
 * Sizes: filesystem first (dev), CDN HEAD request fallback (Lambda).
 * Directories always have size 0.
 */
export async function buildEntries(
  subPath:   string,
  origin:    string,
  filesRoot: string | null,
): Promise<DirEntry[]> {
  const children = getChildNames(subPath);

  const entries = await Promise.all(
    [...children.entries()].map(async ([name, isDir]) => {
      let size = 0;
      if (!isDir) {
        const relPath = subPath ? `${subPath}/${name}` : name;
        if (filesRoot) {
          try { size = fs.statSync(nodePath.join(filesRoot, relPath)).size; } catch {}
        }
        if (!size) {
          const cdnUrl = GLOB_MAP.get(relPath);
          if (cdnUrl) {
            try {
              const res = await fetch(new URL(cdnUrl, origin).href, { method: 'HEAD' });
              size = Number(res.headers.get('content-length') ?? 0);
            } catch {}
          }
        }
      }
      return { name, isDir, size };
    }),
  );

  entries.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return entries;
}

export function formatSize(bytes: number): string {
  if (!bytes) return '--';
  if (bytes < 1024)           return `${bytes} B`;
  if (bytes < 1024 * 1024)    return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function fileExt(name: string): string {
  return name.includes('.')
    ? name.split('.').pop()!.slice(0, 3).toUpperCase()
    : 'PRG';
}

// ── Meatloaf PRG builder ──────────────────────────────────────────────────────

const BASIC_START = 0x0801;

function u16LE(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff];
}

function addLine(buf: number[], blocks: number, text: string): void {
  buf.push(...u16LE(0x0101), ...u16LE(blocks));
  const s = text.toUpperCase() + '\x00';
  for (let i = 0; i < s.length; i++) buf.push(s.charCodeAt(i) & 0xff);
}

function padRight(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

export function buildPrg(
  hostname: string,
  subPath:  string,
  entries:  DirEntry[],
): Uint8Array {
  const buf: number[] = [...u16LE(BASIC_START)];
  addLine(buf, 0, '\x12"MEATLOAF ARCHIVE" 08 2A');
  addLine(buf, 0, `"${padRight('[URL]', 19)}" NFO`);
  addLine(buf, 0, `"${padRight(hostname.slice(0, 19), 19)}" NFO`);
  if (subPath) {
    addLine(buf, 0, `"${padRight('[PATH]', 19)}" NFO`);
    addLine(buf, 0, `"${padRight(('/' + subPath + '/').slice(0, 19), 19)}" NFO`);
  }
  addLine(buf, 0, '"-------------------" NFO');
  for (const e of entries) {
    // Name must not be padded inside the quotes — the firmware uses the literal
    // string between quotes as the URL path component. Trailing spaces inside
    // quotes corrupt the URL. Padding goes AFTER the closing quote instead,
    // so '"name"' is padded right to 19 chars total before the type tag.
    // This matches the reference c64.meatloaf.cc format exactly.
    const display = e.name.slice(0, 16);
    const q = ('"' + display + '"').padEnd(19);
    if (e.isDir) {
      addLine(buf, 0, `   ${q}DIR`);
    } else {
      const blocks = Math.ceil(e.size / 256);
      const sp     = blocks > 999 ? 0 : blocks > 99 ? 1 : blocks > 9 ? 2 : 3;
      addLine(buf, blocks, `${' '.repeat(sp)}${q}${fileExt(e.name)}`);
    }
  }
  addLine(buf, 65535, 'BLOCKS FREE');
  buf.push(0x00, 0x00);
  return new Uint8Array(buf);
}
