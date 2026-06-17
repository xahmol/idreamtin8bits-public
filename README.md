# Retro Archive Starter — Meatloaf + Assembly64

An Astro 5 starter for running a small retro/8-bit software archive that is
directly accessible from two niche but well-loved retro-computing clients:

- **[Meatloaf](https://meatloaf.cc)** — a Wi-Fi IEC Serial device for real
  Commodore hardware. Your archive shows up as a disk directory the C64/C128
  can `LOAD` from over Wi-Fi.
- **[Assembly64](https://assembly64.hackerswithstyle.se/assembly/index.html)** —
  a PC client for browsing and downloading C64/C128/GEOS/CP-M software, with
  support for custom "home servers". This starter implements that home
  server protocol (AQL search, file listing, screenshots, downloads).

It also includes the file-archive browser pages both protocols are built on
top of, and the Astro content-collection schema (platforms + applications)
that drives the whole thing.

This code was extracted from [idreamtin8bits.com](https://idreamtin8bits.com)
and generalized — every site-specific value lives in one config file.

---

## Quick start

```bash
git clone <this-repo>
cd idreamtin8bits-public
npm install --legacy-peer-deps
```

Edit `src/config/retro-archive.ts` — this is the only file you need to touch
to make the archive yours:

```ts
export const ARCHIVE_CONFIG = {
  a64Group:    'mygroup',
  a64Handle:   'myhandle',
  a64Country:  'US',
  meatloafHostname:  'ml.mysite.com',
  meatloafShortcode: 'MYSITE',
  siteUrl: 'https://mysite.com',
};
```

Also update `site` in `astro.config.mjs` to match `siteUrl`.

```bash
npm run dev
```

Visit `http://localhost:4321/files/` to see the archive browser.

See `docs/configuration.md` for what every field controls.

---

## Adding platforms and applications

**Platforms** (`src/content/platforms/<slug>.mdoc`) are the top-level
categories shown on `/files/` — one entry per machine/OS:

```yaml
---
displayName: Commodore 64
shortName: C64
meatloaf: true
sortOrder: 1
---
```

`meatloaf: true` controls whether the Meatloaf "ML" load-command button
appears for files under that platform.

**Applications** (`src/content/applications/<slug>.mdoc`) are individual
pieces of software:

```yaml
---
name: My Demo
platform: c64
shortDescription: A short one-liner shown on cards.
date: '2026-01-01'
---

Markdoc body text shown on the application's page.
```

**The slug must exactly match the directory name** under
`public/files/<platform>/<slug>/` where the actual downloadable files live —
this is how the code maps a CMS entry to its files. Use all-lowercase slugs.

An example entry (`example-demo`) is included to show the convention —
replace or delete it.

---

## Meatloaf setup

1. Point a subdomain (e.g. `ml.mysite.com`) at this Astro app's hosting.
2. Set `meatloafHostname` in `src/config/retro-archive.ts` to that subdomain.
3. `src/middleware.ts` rewrites requests from that hostname to
   `/api/meatloaf/<path>` automatically — no further wiring needed.
4. On the C64/C128: `LOAD"HTTPS://ML.MYSITE.COM",8` lists the root directory
   as a PRG binary the Meatloaf firmware renders as a disk directory.
5. Optional: register a `ML:` shortcode at [meatloaf.cc](https://meatloaf.cc)
   so users can type `LOAD"ML:MYSITE",8` instead of the full URL.

Full protocol details: `docs/meatloaf-endpoint.md`.

---

## Assembly64 setup

The Assembly64 PC client lets users add custom "home servers". Once your
site is deployed:

1. In Assembly64: **Main** tab → **AQL Search** → **Server** field → **Edit**
   → **Add Server**.
2. **Server Link**: your `siteUrl` (must be `https://`).
3. Search `(group:"<your a64Group>")` to see all your entries.

Only applications whose `platform` is `c64`, `c128`, `geos`, or `cpm` are
indexed for Assembly64 (`A64_PLATFORMS` in `src/lib/a64.ts`) — these are the
platforms the official client supports.

Full protocol reference: `docs/assembly64-api.md`.

---

## Deployment

The reference deployment is AWS Amplify Hosting (SSR via `astro-aws-amplify`).
Any Astro SSR adapter works — see `docs/deployment.md` for adapter-swap
instructions and the Lambda-vs-filesystem caveat that affects file serving.

---

## What is NOT included

This is a deliberately narrow extraction. Left out, with reasons:

| Excluded | Why |
|---|---|
| Contact form | Needs AWS SES credentials + Cloudflare Turnstile — site-specific, easily replaced with any form service |
| BBS feed endpoints (news/files/applications feeds) | Specific to a companion Telnet BBS project, not part of the web archive |
| Blog / photo / video / about content collections | Site content, not reusable infrastructure |
| Trivia / game-specific feeds | Site-specific mini-games |
| Keystatic CMS wiring | Optional — the content schema works with hand-edited `.mdoc` files; see `docs/configuration.md` for adding Keystatic back |

---

## License

Licensed under the [GNU General Public License v3.0](LICENSE) (or later).

The Meatloaf and Assembly64 protocol implementations are original code
written against public protocol references (see `docs/` for credits and
source links). No code from the Meatloaf or Assembly64 projects themselves
is included.
