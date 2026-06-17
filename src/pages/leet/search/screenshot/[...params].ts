import type { APIRoute } from 'astro';
import { getA64Index, findEntry, A64_CORS } from '../../../../lib/a64.ts';

export const GET: APIRoute = async ({ params, url }) => {
  const parts = (params.params ?? '').replace(/^\/|\/$/g, '').split('/');
  if (parts.length < 2) {
    return new Response(JSON.stringify({ error: 'Bad path' }), { status: 400, headers: A64_CORS });
  }

  const itemId = parts[0];

  const index = await getA64Index();
  const entry = findEntry(index, itemId);

  if (!entry?.hasScreenshot) {
    return new Response(null, { status: 404, headers: A64_CORS });
  }

  const screenshotUrl = new URL(`/a64-screenshots/${entry.id}.png`, url.origin).href;
  const imgRes = await fetch(screenshotUrl);
  if (!imgRes.ok) {
    return new Response(null, { status: 404, headers: A64_CORS });
  }
  const data = await imgRes.arrayBuffer();
  return new Response(data, {
    status: 200,
    headers: {
      'Content-Type':        'application/octet-stream',
      'Content-Disposition': 'attachment; filename=screenshot.png',
      ...A64_CORS,
    },
  });
};
