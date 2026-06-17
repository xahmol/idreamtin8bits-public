import type { APIRoute } from 'astro';
import { getA64Index, parseAQL, searchIndex, toContentItem, jsonResponse } from '../../../../lib/a64.ts';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT     = 500;

export const GET: APIRoute = async ({ params, url }) => {
  const raw = (params.params ?? '').replace(/^\/|\/$/g, '');
  let offset = 0;
  let limit  = DEFAULT_LIMIT;

  if (raw) {
    const parts = raw.split('/');
    if (parts.length === 1) {
      offset = parseInt(parts[0], 10) || 0;
    } else if (parts.length === 2) {
      offset = parseInt(parts[0], 10) || 0;
      limit  = Math.min(parseInt(parts[1], 10) || DEFAULT_LIMIT, MAX_LIMIT);
    } else {
      return jsonResponse({ error: 'Bad path' }, 400);
    }
  }

  const query     = url.searchParams.get('query') ?? '';
  const queryDict = parseAQL(decodeURIComponent(query));

  const index  = await getA64Index();
  const result = searchIndex(index, queryDict, offset, limit);

  return jsonResponse(result.map(toContentItem));
};
