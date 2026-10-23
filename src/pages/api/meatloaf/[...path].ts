/**
 * Meatloaf API endpoint — serves C64 BASIC directory listings and raw files
 * to Meatloaf Wi-Fi devices over HTTP.
 *
 * Meatloaf — A Commodore IEC Serial multi-device emulator
 *   https://meatloaf.cc
 *   https://github.com/idolpx/meatloaf
 *   Copyright © 2022 James Johnston (idolpx), GNU GPL v3
 *
 * PHP reference implementation (directory listing logic and PRG format):
 *   https://gist.github.com/idolpx/ab8874f8396b6fa0d89cc9bab1e4dee2
 *   Copyright © 2022 James Johnston (idolpx), GNU GPL v3
 *
 * Go reference server (PETSCII conversion, case-insensitive file resolution,
 * Meatloaf-Debug URL format, CMD-style filter syntax):
 *   https://github.com/wazp/meatloaf-server
 *
 * C64 BASIC directory PRG binary format reference:
 *   https://www.pagetable.com/?p=273  (Michael Steil, "LOAD$,8")
 *
 * Protocol summary
 * ─────────────────
 * Meatloaf sends GET requests with a User-Agent containing "MEATLOAF".
 * For a directory URL the server returns a Commodore BASIC v2 PRG binary
 * (load address $0401) that the firmware presents as a disk directory on
 * the C64.  For a file URL it returns the raw PRG bytes with Content-Length
 * set (the firmware needs Content-Length to assert IEC EOI on the last byte).
 *
 * The Meatloaf-Debug response header sets the firmware's internal CWD.
 * Sending a full https:// URL confuses the ML:shortcode/filename URL
 * construction in firmware v1.4; path-only format (e.g. "/meatloaf/") lets
 * the firmware construct file URLs relative to the host it already knows.
 * Direct full-URL loading (LOAD"HTTPS://…",10) works regardless.
 *
 * Routing
 * ───────
 * Requests from ARCHIVE_CONFIG.meatloafHostname (src/config/retro-archive.ts)
 * are rewritten by Astro middleware (src/middleware.ts) from /<path> to
 * /api/meatloaf/<path> before reaching this handler.  The hostname is
 * preserved on the rewritten request, so this handler emits a path-only
 * Meatloaf-Debug header without the /api/meatloaf/ prefix — keeping
 * firmware-constructed file URLs relative to that hostname.
 *
 * PETSCII / case
 * ───────────────
 * Filenames are sent as uppercase ASCII (0x41–0x5A), which display as
 * uppercase letters in the C64's default uppercase/graphics mode — matching
 * the PHP reference and the live c64.meatloaf.cc server.  Characters with
 * no clean PETSCII equivalent ( \  `  {  }  [  ] ) are remapped before
 * display (per the Go reference server).  Underscore is intentionally left
 * unchanged so filenames remain round-trippable for URL construction.
 * Incoming request paths are normalised to lowercase (case-insensitive file
 * resolution — mirrors findFileIgnoreCase() in the Go reference server).
 */

import type { APIRoute } from 'astro';
import fs from 'node:fs';
import nodePath from 'node:path';
import { ARCHIVE_CONFIG } from '../../../config/retro-archive.ts';
import { fetchOrigin } from '../../../lib/files.ts';

// Build-time file discovery — Vite resolves these paths at compile time so the
// Lambda knows what files exist and where to fetch them on the CDN.
// assetsInclude in astro.config.mjs makes Vite treat binary extensions as assets.
const ASSET_URLS = import.meta.glob(
  '../../../../public/files/**/*',
  { eager: true, query: '?url', import: 'default' },
) as Record<string, string>;

// Normalise glob keys to paths relative to public/files/
// e.g. "../../../../public/files/games/foo.prg" → "games/foo.prg"
function normKey(key: string): string {
  return key.replace(/^.*?\/public\/files\//, '');
}

// relPath → CDN URL (populated at build time)
const GLOB_MAP = new Map<string, string>(
  Object.entries(ASSET_URLS).map(([k, v]) => [normKey(k), v]),
);

const SKIP = /^\.|\.html$|\.php$|^api$|^web\.config$/i;
const BASIC_START = 0x0801;

// File-type labels — addLine applies toUpperCase() so case here is cosmetic,
// but keeping uppercase matches the PHP reference for readability.
const EXT_TYPE: Record<string, string> = {
  prg: 'PRG', p00: 'PRG',
  seq: 'SEQ', s00: 'SEQ',
  usr: 'USR', u00: 'USR',
  rel: 'REL', r00: 'REL',
  del: 'DEL',
  d64: 'D64', d71: 'D71', d80: 'D80', d81: 'D81', d82: 'D82',
  d90: 'D90', dnp: 'DNP', g41: 'G41', g64: 'G64', g71: 'G71',
  t64: 'T64', tap: 'TAP', htap: 'TAP',
  crt: 'CRT', tcrt: 'CRT',
  bas: 'BAS', bin: 'BIN', rom: 'ROM',
};

function fileType(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_TYPE[ext] ?? 'PRG';
}

// Map ASCII characters that have no clean PETSCII equivalent to safe
// display substitutes.  Based on convertToPETSCII() in the Go reference server.
// Note: underscore is intentionally NOT remapped so that filenames remain
// round-trippable — the Go server implements a reverse-lookup; we rely on
// Meatloaf firmware lowercasing the LOAD name before the URL fetch instead.
function toPetscii(name: string): string {
  let out = '';
  for (let i = 0; i < name.length; i++) {
    switch (name[i]) {
      case '\\': out += '/';  break;
      case '`':  out += "'";  break;
      case '{':  out += '(';  break;
      case '}':  out += ')';  break;
      case '[':  out += '(';  break;
      case ']':  out += ')';  break;
      default:   out += name[i];
    }
  }
  return out;
}

// Encode a 16-bit value as two little-endian bytes.
function u16LE(v: number): number[] {
  return [v & 0xff, (v >> 8) & 0xff];
}

// Append one BASIC directory line to buf.
// next-line pointer is the conventional dummy value 0x0101 used by real 1541
// disk drives for directory listings (matches PHP reference implementation).
// toUpperCase() mirrors the PHP reference strtoupper() call; uppercase ASCII
// bytes (0x41–0x5A) render as uppercase letters in the C64's default
// uppercase/graphics mode.  Meatloaf firmware lowercases filenames internally
// when constructing HTTP fetch URLs, so files on the server can stay lowercase.
function addLine(buf: number[], blocks: number, text: string): void {
  buf.push(...u16LE(0x0101), ...u16LE(blocks));
  const s = text.toUpperCase() + '\x00';
  for (let i = 0; i < s.length; i++) buf.push(s.charCodeAt(i) & 0xff);
}

function padRight(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

// Build a Commodore BASIC v2 PRG binary that encodes a disk-style directory.
// Load address is $0401; structure follows the PHP reference implementation.
function buildDirPrg(
  hostname: string,
  subPath: string,
  entries: Array<{ name: string; blocks: number; isDir: boolean }>,
): Uint8Array {
  const buf: number[] = [...u16LE(BASIC_START)];
  // Header line: 0x12 = PETSCII REVERSE ON; disk name + ID + format bytes.
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
    const display = toPetscii(e.name).slice(0, 16);
    const q = ('"' + display + '"').padEnd(19);
    if (e.isDir) {
      addLine(buf, 0, `   ${q}DIR`);
    } else {
      const sp = e.blocks > 999 ? 0 : e.blocks > 99 ? 1 : e.blocks > 9 ? 2 : 3;
      addLine(buf, e.blocks, `${' '.repeat(sp)}${q}${fileType(e.name)}`);
    }
  }

  addLine(buf, 65535, 'BLOCKS FREE');
  buf.push(0x00, 0x00);
  return new Uint8Array(buf);
}

function findFilesRoot(): string | null {
  for (const p of [
    nodePath.join(process.cwd(), 'public', 'files'),
    nodePath.join(process.cwd(), 'files'),
    nodePath.join(process.cwd(), '..', 'static', 'files'),
    nodePath.join(process.cwd(), '..', '..', 'static', 'files'),
  ]) {
    try { if (fs.statSync(p).isDirectory()) return p; } catch {}
  }
  return null;
}

// Enumerate direct children within GLOB_MAP for a given subPath prefix.
// Returns map of name → isDir.
function globChildren(subPath: string): Map<string, boolean> {
  const prefix = subPath ? subPath + '/' : '';
  const result = new Map<string, boolean>();
  for (const key of GLOB_MAP.keys()) {
    if (!key.startsWith(prefix)) continue;
    const rest = key.slice(prefix.length);
    const slash = rest.indexOf('/');
    const name = slash === -1 ? rest : rest.slice(0, slash);
    if (name && !SKIP.test(name) && !result.has(name)) {
      result.set(name, slash !== -1);
    }
  }
  return result;
}

// Meatloaf-Debug: path-only CWD hint for the firmware.
// Full https:// URLs break ML:shortcode/filename file loading in v1.4.
function dirResponse(prg: Uint8Array, debugUrl: string): Response {
  return new Response(prg, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="index.prg"',
      'Meatloaf-Debug': debugUrl,
    },
  });
}

function fileResponse(data: ArrayBuffer | Uint8Array, name: string): Response {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  // Content-Length is required by the Meatloaf ESP32 firmware to correctly
  // signal IEC EOI (End of Identify) on the last byte when serving the file
  // to the C64.  Without it the firmware cannot know where the file ends.
  return new Response(bytes, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.byteLength),
    },
  });
}

function htmlPage(subPath: string): Response {
  const esc = (s: string) => s.replace(/[&<>"']/g, c => `&#${c.charCodeAt(0)};`);
  const pathNote = subPath ? ` Path: /${esc(subPath)}` : '';
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Meatloaf</title></head>` +
    `<body><p>This endpoint serves Commodore directory listings to ` +
    `<a href="https://meatloaf.cc">Meatloaf</a> devices.${pathNote}</p></body></html>`,
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export const GET: APIRoute = async ({ params, request }) => {
  const ua = request.headers.get('user-agent') ?? '';
  const isMeatloaf = ua.includes('MEATLOAF');
  const rawPath = (params.path ?? '').replace(/^\/+|\/+$/g, '');

  // Block directory traversal before any fs or fetch operations.
  if (rawPath.split('/').some(s => s === '..')) {
    return new Response('Forbidden', { status: 403 });
  }

  // Normalise to lowercase for case-insensitive file resolution.
  // Meatloaf firmware may send uppercase filenames (taken verbatim from the
  // uppercase PRG bytes) in subsequent LOAD requests; lowercasing matches the
  // actual server filenames.  Mirrors findFileIgnoreCase() in the Go server.
  const lookupPath = rawPath.toLowerCase();

  const reqUrl = new URL(request.url);
  const hostname = reqUrl.hostname;
  const origin = fetchOrigin(reqUrl.origin);
  // When accessed via ARCHIVE_CONFIG.meatloafHostname, emit a path-only
  // Meatloaf-Debug header without the /api/meatloaf/ prefix so the firmware
  // constructs file URLs relative to that hostname (e.g. /c64/file.prg, not
  // /api/meatloaf/c64/file.prg).
  const isMlHost = hostname === ARCHIVE_CONFIG.meatloafHostname;
  const debugUrl = isMlHost
    ? `/${lookupPath ? lookupPath + '/' : ''}`
    : `/api/meatloaf/${lookupPath ? lookupPath + '/' : ''}`;
  const filesRoot = findFilesRoot();

  // ── Primary: filesystem (works in dev and Amplify if files/ is co-located) ──

  if (filesRoot) {
    const absPath = lookupPath ? nodePath.join(filesRoot, lookupPath) : filesRoot;
    if (!absPath.startsWith(filesRoot)) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const stat = fs.statSync(absPath);

      if (stat.isDirectory()) {
        if (!isMeatloaf) return htmlPage(lookupPath);
        const names = fs.readdirSync(absPath).filter(n => !SKIP.test(n));
        const entries = names.map(name => {
          try {
            const s = fs.statSync(nodePath.join(absPath, name));
            return s.isDirectory()
              ? { name, isDir: true, blocks: 0 }
              : { name, isDir: false, blocks: Math.ceil(s.size / 256) };
          } catch {
            return { name, isDir: false, blocks: 0 };
          }
        });
        return dirResponse(buildDirPrg(hostname, lookupPath, entries), debugUrl);
      }

      // Regular file — stream raw bytes back.
      const buf = fs.readFileSync(absPath);
      return fileResponse(buf, nodePath.basename(lookupPath));
    } catch {
      // File/dir not found on filesystem — fall through to CDN fallback.
    }
  }

  // ── Fallback: glob manifest + CDN fetch (Amplify Lambda without fs access) ──

  const children = globChildren(lookupPath);

  if (lookupPath && children.size === 0) {
    // Might be a file — check parent listing from glob.
    const parentPath = lookupPath.includes('/')
      ? lookupPath.split('/').slice(0, -1).join('/')
      : '';
    const fileName = lookupPath.split('/').pop()!;
    const parentChildren = globChildren(parentPath);

    if (parentChildren.has(fileName) && parentChildren.get(fileName) === false) {
      // Known file — proxy bytes from CDN.
      const cdnUrl = GLOB_MAP.get(lookupPath);
      const fetchUrl = cdnUrl && cdnUrl.startsWith('/')
        ? `${origin}${cdnUrl}`
        : cdnUrl ?? `${origin}/files/${lookupPath}`;
      const res = await fetch(fetchUrl);
      if (res.ok) return fileResponse(await res.arrayBuffer(), fileName);
    }

    // Last resort: try the public static path directly.
    const staticRes = await fetch(`${origin}/files/${lookupPath}`);
    if (staticRes.ok) {
      return fileResponse(await staticRes.arrayBuffer(), fileName);
    }

    return new Response('Not Found', { status: 404 });
  }

  if (!isMeatloaf) return htmlPage(lookupPath);

  // Build listing from glob + HEAD requests for block counts (runs in parallel).
  const entries = await Promise.all(
    [...children.entries()].map(async ([name, isDir]) => {
      if (isDir) return { name, isDir: true, blocks: 0 };
      const relPath = lookupPath ? `${lookupPath}/${name}` : name;
      const cdnUrl = GLOB_MAP.get(relPath);
      const headUrl = cdnUrl && cdnUrl.startsWith('/')
        ? `${origin}${cdnUrl}`
        : cdnUrl ?? `${origin}/files/${relPath}`;
      try {
        const res = await fetch(headUrl, { method: 'HEAD' });
        const len = Number(res.headers.get('content-length') ?? 0);
        return { name, isDir: false, blocks: Math.ceil(len / 256) || 0 };
      } catch {
        return { name, isDir: false, blocks: 0 };
      }
    }),
  );

  return dirResponse(buildDirPrg(hostname, lookupPath, entries), debugUrl);
};
