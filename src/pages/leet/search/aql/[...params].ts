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

  // url.searchParams.get() already URL-decodes once. Some clients additionally
  // double-encode the query value, so we decode again — but a literal '%'
  // wildcard character (not part of valid percent-encoding) survives the first
  // decode and would make a second decodeURIComponent() throw URIError, so
  // fall back to the once-decoded value on failure instead of erroring out.
  const query = url.searchParams.get('query') ?? '';
  let decodedQuery = query;
  try { decodedQuery = decodeURIComponent(query); } catch { /* literal % wildcard, etc. */ }
  const queryDict = parseAQL(decodedQuery);

  const index  = await getA64Index();
  const result = searchIndex(index, queryDict, offset, limit);

  return jsonResponse(result.map(toContentItem));
};
