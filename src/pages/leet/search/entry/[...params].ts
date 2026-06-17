import type { APIRoute } from 'astro';
import fs from 'node:fs';
import nodePath from 'node:path';
import { getA64Index, findEntry, jsonResponse, A64_CORS } from '../../../../lib/a64.ts';
import { GLOB_MAP, findFilesRoot } from '../../../../lib/files.ts';

export const GET: APIRoute = async ({ params, url }) => {
  // URL: /leet/search/entry/{itemId}/{categoryId}/{fileId}
  const parts = (params.params ?? '').replace(/^\/|\/$/g, '').split('/');
  if (parts.length < 3) return jsonResponse({ error: 'Bad path' }, 400);

  const itemId = parts[0];
  const fileId = parseInt(parts[2], 10);
  if (isNaN(fileId)) return jsonResponse({ error: 'fileId must be integer' }, 400);

  const index = await getA64Index();
  const entry = findEntry(index, itemId);
  if (!entry) return jsonResponse({ error: 'Not found' }, 404);

  const file = entry.files[fileId];
  if (!file) return jsonResponse({ error: 'File not found' }, 404);

  const filesRoot = findFilesRoot();
  let size = 0;
  let mtime = Date.now();

  if (filesRoot) {
    try {
      const stat = fs.statSync(nodePath.join(filesRoot, file.cdnPath));
      size  = stat.size;
      mtime = stat.mtimeMs;
    } catch {}
  } else {
    const cdnUrl = GLOB_MAP.get(file.cdnPath);
    if (cdnUrl) {
      try {
        const res = await fetch(new URL(cdnUrl, url.origin).href, { method: 'HEAD' });
        size = Number(res.headers.get('content-length') ?? 0);
      } catch {}
    }
  }

  return jsonResponse({ path: file.path, id: file.id, size, date: Math.round(mtime) });
};
