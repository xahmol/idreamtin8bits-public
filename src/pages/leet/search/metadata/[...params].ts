import type { APIRoute } from 'astro';
import { getA64Index, findEntry, jsonResponse } from '../../../../lib/a64.ts';

export const GET: APIRoute = async ({ params, url }) => {
  const parts = (params.params ?? '').replace(/^\/|\/$/g, '').split('/');
  if (parts.length < 2) return jsonResponse({ error: 'Bad path' }, 400);

  const itemId = parts[0];

  const index = await getA64Index();
  const entry = findEntry(index, itemId);
  if (!entry) return jsonResponse({ error: 'Not found' }, 404);

  return jsonResponse({
    name:        entry.name,
    group:       entry.group,
    handle:      entry.handle,
    releaseDate: entry.released,
    event:       entry.event,
    rating:      entry.rating,
    url:         new URL(`/files/${entry.platform}/${entry.id}/`, url.origin).href,
  });
};
