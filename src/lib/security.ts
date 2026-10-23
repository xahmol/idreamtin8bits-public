// Request hardening applied in src/middleware.ts: a CSRF origin check for
// state-changing requests and security response headers on SSR responses.
// On Amplify, static files (served by CloudFront, never reaching the server)
// get the same headers from customHttp.yml -- keep the two in sync.
import { ARCHIVE_CONFIG } from '../config/retro-archive.ts';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// The canonical site plus its www. variant (or the bare domain, if siteUrl
// is the www. host). Extend if the site answers on more host names.
const site = new URL(ARCHIVE_CONFIG.siteUrl);
const altHost = site.hostname.startsWith('www.') ? site.hostname.slice(4) : `www.${site.hostname}`;
const ALLOWED_ORIGINS = new Set([site.origin, `${site.protocol}//${altHost}`]);
const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * True for a state-changing request that a browser sent from another site.
 * Browsers always send Origin on cross-origin POST/PUT/PATCH/DELETE; requests
 * without Origin and without Sec-Fetch-Site come from non-browser clients,
 * which carry no victim session and are not a CSRF vector.
 */
export function isCrossSiteWrite(request: Request, url: URL): boolean {
  if (SAFE_METHODS.has(request.method)) return false;
  const origin = request.headers.get('origin');
  if (origin) return !(ALLOWED_ORIGINS.has(origin) || origin === url.origin || LOOPBACK.test(origin));
  return request.headers.get('sec-fetch-site') === 'cross-site';
}

const HEADERS: Record<string, string> = {
  // Add includeSubDomains only once every subdomain serves HTTPS.
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
};

/** Add the security headers to an SSR response. */
export function withSecurityHeaders(response: Response): Response {
  try {
    for (const [k, v] of Object.entries(HEADERS)) response.headers.set(k, v);
    return response;
  } catch {
    // Immutable headers (a Response passed through from fetch()): copy it.
    const copy = new Response(response.body, response);
    for (const [k, v] of Object.entries(HEADERS)) copy.headers.set(k, v);
    return copy;
  }
}
