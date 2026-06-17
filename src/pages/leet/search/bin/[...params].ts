import type { APIRoute } from 'astro';
import fs from 'node:fs';
import nodePath from 'node:path';
import { getA64Index, findEntry, A64_CORS } from '../../../../lib/a64.ts';
import { GLOB_MAP, findFilesRoot } from '../../../../lib/files.ts';

export const GET: APIRoute = async ({ params, url }) => {
  // URL: /leet/search/bin/{itemId}/{categoryId}/{fileId}[/{fileId1}/.../{fileId6}]
  const parts = (params.params ?? '').replace(/^\/|\/$/g, '').split('/');
  if (parts.length < 3) {
    return new Response(JSON.stringify({ error: 'Bad path' }), { status: 400, headers: A64_CORS });
  }

  const itemId   = parts[0];
  // parts[1] is categoryId — accepted but unused
  const filename = parts.slice(2).join('/');  // supports multi-segment paths

  const index = await getA64Index();
  const entry = findEntry(index, itemId);
  if (!entry) {
    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: A64_CORS });
  }

  // Find the file by path match or by integer ID if filename is a number.
  // "na" is a Docker home server special case: return the first file (used for single-file entries).
  let file = filename === 'na'
    ? entry.files[0]
    : entry.files.find(f => f.path === filename);
  if (!file && /^\d+$/.test(filename)) {
    file = entry.files[parseInt(filename, 10)];
  }
  if (!file) {
    return new Response(JSON.stringify({ error: 'File not found' }), { status: 404, headers: A64_CORS });
  }

  // In dev: read directly from filesystem. In Lambda: fetch from CloudFront CDN.
  let data: ArrayBuffer;
  const filesRoot = findFilesRoot();
  if (filesRoot) {
    try {
      const buf = fs.readFileSync(nodePath.join(filesRoot, file.cdnPath));
      data = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    } catch {
      return new Response(JSON.stringify({ error: 'File read error' }), { status: 500, headers: A64_CORS });
    }
  } else {
    const cdnUrl = GLOB_MAP.get(file.cdnPath);
    if (!cdnUrl) {
      return new Response(JSON.stringify({ error: 'File unavailable' }), { status: 404, headers: A64_CORS });
    }
    const fileRes = await fetch(new URL(cdnUrl, url.origin).href);
    if (!fileRes.ok) {
      return new Response(JSON.stringify({ error: 'Fetch failed' }), { status: 502, headers: A64_CORS });
    }
    data = await fileRes.arrayBuffer();
  }

  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type':        'application/octet-stream',
      'Content-Disposition': `attachment; filename="${file.path}"`,
      ...A64_CORS,
    },
  });
};
