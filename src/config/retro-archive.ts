/**
 * Site-specific configuration for the retro archive.
 * Edit this file to customise for your own archive.
 */
export const ARCHIVE_CONFIG = {
  // ── Assembly64 home server ────────────────────────────────────────────────
  // These appear in Assembly64 search results. Use short lowercase identifiers.
  a64Group:   'mygroup',   // your group tag — shown in Assembly64 "Group" field
  a64Handle:  'myhandle',  // your handle  — shown in Assembly64 "Handle" field
  a64Country: 'US',        // ISO 3166-1 alpha-2 country code

  // ── Meatloaf Wi-Fi IEC ────────────────────────────────────────────────────
  // meatloafHostname: the subdomain that points at this Astro app for Meatloaf
  //   devices (e.g. ml.mysite.com). Must match the DNS record and the middleware.
  // meatloafShortcode: the ML: shortcode registered at meatloaf.cc for your site.
  //   Devices can then use  LOAD"ML:MYSITE/file.prg",8  to load files.
  meatloafHostname:  'ml.mysite.com',
  meatloafShortcode: 'MYSITE',

  // ── Site ──────────────────────────────────────────────────────────────────
  siteUrl: 'https://mysite.com',  // canonical base URL (no trailing slash)
} as const;
