import { defineMiddleware } from 'astro:middleware';
import { ARCHIVE_CONFIG } from './config/retro-archive.ts';
import { isCrossSiteWrite, withSecurityHeaders } from './lib/security.ts';

// Rewrite requests from your ML subdomain to the meatloaf API endpoint.
// Set meatloafHostname in src/config/retro-archive.ts to your ML subdomain.
// The meatloaf endpoint detects this hostname and emits a path-only
// Meatloaf-Debug header so the firmware constructs correct file URLs.
const ML_HOSTS = new Set([ARCHIVE_CONFIG.meatloafHostname]);

export const onRequest = defineMiddleware(async (context, next) => {
  const host = context.request.headers.get('host')?.split(':')[0] ?? '';
  // Guard against re-processing the already-rewritten request (rewrite re-runs middleware).
  if (ML_HOSTS.has(host) && !context.url.pathname.startsWith('/api/meatloaf')) {
    return context.rewrite(`/api/meatloaf${context.url.pathname}${context.url.search}`);
  }
  if (isCrossSiteWrite(context.request, context.url)) {
    return new Response('Cross-site request forbidden', { status: 403 });
  }
  return withSecurityHeaders(await next());
});
