import type { APIRoute } from 'astro';
import fs from 'node:fs';
import nodePath from 'node:path';
import { getA64Index, findEntry, jsonResponse, A64_CORS } from '../../../../lib/a64.ts';
import { GLOB_MAP, findFilesRoot } from '../../../../lib/files.ts';

export const GET: APIRoute = async ({ params, url }) => {
  const parts = (params.params ?? '').replace(/^\/|\/$/g, '').split('/');
  if (parts.length < 2) return jsonResponse({ error: 'Bad path' }, 400);

  const itemId = parts[0];
  // parts[1] is categoryId — ignored for lookup, accepted for protocol compatibility

  const index = await getA64Index();
  const entry = findEntry(index, itemId);
  if (!entry) return jsonResponse({ error: 'Not found' }, 404);

  const filesRoot = findFilesRoot();

  const contentEntry = await Promise.all(
    entry.files.map(async file => {
      let size = 0;
      if (filesRoot) {
        try {
          size = fs.statSync(nodePath.join(filesRoot, file.cdnPath)).size;
        } catch {}
      }
      if (!size) {
        const cdnUrl = GLOB_MAP.get(file.cdnPath);
        if (cdnUrl) {
          try {
            const res = await fetch(new URL(cdnUrl, url.origin).href, { method: 'HEAD' });
            size = Number(res.headers.get('content-length') ?? 0);
          } catch {}
        }
      }
      const mtime = filesRoot
        ? (() => { try { return fs.statSync(nodePath.join(filesRoot, file.cdnPath)).mtimeMs; } catch { return Date.now(); } })()
        : Date.now();

      return { path: file.path, id: file.id, size, date: Math.round(mtime) };
    }),
  );

  return new Response(
    JSON.stringify({ contentEntry, isContentByItself: contentEntry.length === 1 }),
    { headers: { 'Content-Type': 'application/json', ...A64_CORS } },
  );
};
