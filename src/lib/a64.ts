import { getCollection } from 'astro:content';
import { getChildNames, GLOB_MAP } from './files.ts';
import { ARCHIVE_CONFIG } from '../config/retro-archive.ts';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface A64File {
  id:      number;   // 0-indexed within the entry
  path:    string;   // filename
  cdnPath: string;   // relative CDN key (platform/slug/filename)
}

export interface A64Entry {
  id:              string;   // app slug (internal — used for file paths)
  numId:           number;   // sequential integer — returned as ContentItem "id"
  name:            string;
  category:        number;
  categoryKey:     string;
  group:           string;
  handle:          string;
  event:           string;
  rating:          null;
  year:            number;
  updated:         string;   // YYYY-MM-DD
  released:        string;   // YYYY-MM-DD (same as updated)
  country:         string;
  place:           null;
  compo:           null;
  siteCategory:    null;
  siteRating:      null;
  platform:        string;
  files:           A64File[];
  hasScreenshot:   boolean;
}

// ── Configuration ─────────────────────────────────────────────────────────────

export const A64_PLATFORMS = ['c64', 'c128', 'geos', 'cpm'];

export const A64_FILE_EXTS = new Set([
  '.prg', '.d64', '.d71', '.d81', '.d82', '.crt', '.tap', '.t64', '.sid', '.g64', '.bin',
]);

// Map each application slug to its Assembly64 category.
// Slugs not listed here default to { key: 'misc', id: 12 }.
// Keys must match the .mdoc filename (without extension) in src/content/applications/.
// Example:
//   'my-demo': { key: 'demos', id: 1 },
//   'my-tool': { key: 'tools', id: 8 },
const CATEGORY_MAP: Record<string, { key: string; id: number }> = {
  // Add your application slugs here:
};

// aqlKey string → integer (for filtering search results)
export const CATEGORY_KEY_TO_INT: Record<string, number> = {
  games:     0,
  demos:     1,
  c128:      2,
  graphics:  3,
  music:     4,
  bbs:       6,
  charts:    7,
  tools:     8,
  mags:      9,
  easyflash: 10,
  intros:    11,
  misc:      12,
  reu:       25,
};

// ── Presets (matches Spiffy ASSEMBLY_FILTERS exactly) ─────────────────────────

function yearValues(start = 1980): { id: number; aqlKey: string; name: string }[] {
  const cur = new Date().getFullYear();
  return Array.from({ length: cur - start + 1 }, (_, i) => {
    const y = String(start + i);
    return { id: 0, aqlKey: y, name: y };
  });
}

function ratingValues(): { id: number; aqlKey: string; name: string }[] {
  return Array.from({ length: 10 }, (_, i) => ({
    id: 0, aqlKey: `>=${i + 1}`, name: String(i + 1),
  }));
}

export const A64_PRESETS = [
  {
    type: 'category',
    description: 'Category',
    values: [
      { id:  1, aqlKey: 'demos',     name: 'Demos'     },
      { id:  0, aqlKey: 'games',     name: 'Games'     },
      { id: 11, aqlKey: 'intros',    name: 'Intros'    },
      { id:  2, aqlKey: 'c128',      name: 'C128'      },
      { id:  6, aqlKey: 'bbs',       name: 'BBS'       },
      { id:  7, aqlKey: 'charts',    name: 'Charts'    },
      { id:  9, aqlKey: 'mags',      name: 'Mags'      },
      { id: 10, aqlKey: 'easyflash', name: 'Easyflash' },
      { id:  3, aqlKey: 'graphics',  name: 'Graphics'  },
      { id: 12, aqlKey: 'misc',      name: 'Misc'      },
      { id:  4, aqlKey: 'music',     name: 'Music'     },
      { id: 25, aqlKey: 'reu',       name: 'Reu'       },
      { id:  8, aqlKey: 'tools',     name: 'Tools'     },
    ],
  },
  {
    type: 'date',
    description: 'Date',
    values: yearValues(),
  },
  {
    type: 'rating',
    description: 'Rating',
    values: ratingValues(),
  },
];

// ── Index builder ─────────────────────────────────────────────────────────────

let _cache: A64Entry[] | null = null;

export async function getA64Index(): Promise<A64Entry[]> {
  if (_cache) return _cache;
  _cache = await buildA64Index();
  return _cache;
}

async function buildA64Index(): Promise<A64Entry[]> {
  const allApps = await getCollection('applications');
  const entries: A64Entry[] = [];

  for (const app of allApps) {
    const slug     = app.id.replace(/\.mdoc$/, '');
    const platform = app.data.platform as string;

    if (!A64_PLATFORMS.includes(platform)) continue;

    const cat = CATEGORY_MAP[slug] ?? { key: 'misc', id: 12 };

    // Enumerate files in this app's directory
    const subPath   = `${platform}/${slug}`;
    const children  = getChildNames(subPath);
    const files: A64File[] = [];
    let fileIdx = 0;

    for (const [name, isDir] of children.entries()) {
      if (isDir) continue;
      const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : '';
      if (!A64_FILE_EXTS.has(ext)) continue;
      files.push({
        id:      fileIdx++,
        path:    name,
        cdnPath: `${subPath}/${name}`,
      });
    }

    if (!files.length) continue;  // skip apps with no A64-compatible files

    const dateStr = (app.data.date as string | undefined) ?? '';
    const year    = dateStr ? parseInt(dateStr.slice(0, 4), 10) : new Date().getFullYear();
    const updated = dateStr ? dateStr.slice(0, 10) : new Date().toISOString().slice(0, 10);

    entries.push({
      id:             slug,
      numId:          0,   // assigned after sort below
      name:           app.data.name as string,
      category:       cat.id,
      categoryKey:    cat.key,
      group:          ARCHIVE_CONFIG.a64Group,
      handle:         ARCHIVE_CONFIG.a64Handle,
      event:          '',
      rating:         null,
      year,
      updated,
      released:       updated,
      country:        ARCHIVE_CONFIG.a64Country,
      place:          null,
      compo:          null,
      siteCategory:   null,
      siteRating:     null,
      platform,
      files,
      hasScreenshot:  !!(app.data.featureImage),
    });
  }

  // Stable sort by slug, then assign sequential numeric IDs.
  // The Assembly64 client expects integer IDs in ContentItem and sends them back
  // for screenshot, entries, and bin endpoint lookups.
  entries.sort((a, b) => a.id.localeCompare(b.id));
  entries.forEach((e, i) => { e.numId = i; });

  return entries;
}

// ── Entry lookup ──────────────────────────────────────────────────────────────

// Accepts either a numeric string (from client using ContentItem id) or a slug.
export function findEntry(index: A64Entry[], itemId: string): A64Entry | undefined {
  if (/^\d+$/.test(itemId)) {
    const n = parseInt(itemId, 10);
    return index.find(e => e.numId === n);
  }
  return index.find(e => e.id === itemId);
}

// ── AQL parser (ported from Spiffy Python) ───────────────────────────────────

export function parseAQL(query: string): Record<string, string> {
  const pattern = /\(?(\w+):"?([^")]+)"?\)?/g;
  const result: Record<string, string> = {};
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(query)) !== null) {
    result[m[1].toLowerCase()] = m[2].toLowerCase();
  }
  return result;
}

// ── Search ────────────────────────────────────────────────────────────────────

// String-field matching for name/group/handle. Per the official home server
// protocol: a bare value with no wildcard does a substring match (kept for
// backward compatibility with existing clients/queries); '%' acts as a
// SQL-LIKE wildcard (e.g. "a%" = starts with "a"); a lone '@' means
// "match everything" (used by some clients to request an unfiltered field).
function matchesStringFilter(fieldValue: string, pattern: string): boolean {
  const field = fieldValue.toLowerCase();
  const pat   = pattern.toLowerCase();
  if (pat === '@') return true;
  if (pat.includes('%')) {
    const escaped = pat.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
    return new RegExp(`^${escaped}$`).test(field);
  }
  return field.includes(pat);
}

export function searchIndex(
  entries:    A64Entry[],
  queryDict:  Record<string, string>,
  offset:     number,
  limit:      number,
): A64Entry[] {
  let result = entries.filter(e => {
    for (const [key, value] of Object.entries(queryDict)) {
      switch (key) {
        case 'name':
          if (!matchesStringFilter(e.name, value)) return false;
          break;
        case 'category': {
          const catInt = CATEGORY_KEY_TO_INT[value] ?? -1;
          if (e.category !== catInt) return false;
          break;
        }
        case 'type':
          if (!e.files.some(f => f.path.toLowerCase().endsWith('.' + value))) return false;
          break;
        case 'group':
          if (!matchesStringFilter(e.group, value)) return false;
          break;
        case 'handle':
          if (!matchesStringFilter(e.handle, value)) return false;
          break;
        case 'year':
          if (String(e.year) !== value) return false;
          break;
        case 'country':
          if (e.country.toLowerCase() !== value) return false;
          break;
        // 'order' and 'repo' are not filters — handled separately
      }
    }
    return true;
  });

  if ('order' in queryDict) {
    result.sort((a, b) => a.name.localeCompare(b.name));
    if (queryDict.order !== 'asc') result.reverse();
  }

  if (offset > 0) result = result.slice(offset);
  if (result.length > limit) result = result.slice(0, limit);

  return result;
}

// ── ContentItem serializer (Docker schema) ────────────────────────────────────

// The Assembly64 client caches screenshots keyed by the last URL segment of
// /leet/search/screenshot/{itemId}/{categoryId}, which is the categoryId integer.
// If multiple items share the same categoryId they all share one cached screenshot.
// Using numId+1000 as the category gives each item a unique cache key while
// avoiding conflicts with official Assembly64 category IDs (max 25).
export const CATEGORY_ID_OFFSET = 1000;

export function toContentItem(e: A64Entry): Record<string, unknown> {
  return {
    id:             String(e.numId),
    name:           e.name,
    category:       e.numId + CATEGORY_ID_OFFSET,
    group:          e.group,
    handle:         e.handle,
    year:           e.year,
    updated:        e.updated,
    released:       e.released,
    country:        e.country,
    event:          e.event,
    rating:         e.rating,
    place:          e.place,
    compo:          e.compo,
    siteCategory:   e.siteCategory,
    siteRating:     e.siteRating,
  };
}

// ── CORS headers ──────────────────────────────────────────────────────────────

export const A64_CORS: HeadersInit = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'token, client-id, DNT, User-Agent, X-Requested-With, ' +
    'If-Modified-Since, Cache-Control, Content-Type, Range',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range',
  'Connection': 'close',
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...A64_CORS },
  });
}
