# CLAUDE.md

Memory bank for AI agents working on this repository.

## Purpose and architecture

This is an Astro 7 SSR starter that exposes a small retro-software archive
through two protocols:

- **Meatloaf** (`src/pages/api/meatloaf/[...path].ts`) — serves C64 BASIC-style
  directory listings and raw files to Meatloaf Wi-Fi IEC devices over plain
  HTTP. Devices identify themselves with `User-Agent: ...MEATLOAF...`.
- **Assembly64 home server** (`src/pages/leet/search/**`) — implements the AQL
  search protocol the Assembly64 PC client uses to query custom home servers.

Both protocols serve files from the same backing store: a build-time glob
manifest of `public/files/**/*` (`src/lib/files.ts`), described by two Astro
content collections (`src/content/platforms/`, `src/content/applications/`).

## Configuration

`src/config/retro-archive.ts` is the single source of truth for every
site-specific value (group/handle/country shown in Assembly64, the Meatloaf
subdomain + shortcode, the canonical site URL). Every other file imports from
here — never hardcode a domain, group name, or shortcode elsewhere.

## Content model

```
src/content/platforms/<slug>.mdoc      — top-level category (C64, C128, ...)
src/content/applications/<slug>.mdoc   — one piece of software
public/files/<platform>/<slug>/        — actual downloadable files
```

The application's CMS slug **must equal** the directory name under
`public/files/<platform>/`, lowercase. `src/lib/applications.ts` and
`src/lib/platforms.ts` both strip the `.mdoc` extension from `e.id` when
deriving the slug — any code comparing slugs to folder names must do the
same.

## Key files

| File | Role |
|---|---|
| `src/config/retro-archive.ts` | Single config file — edit this to deploy your own archive |
| `src/lib/files.ts` | Build-time file manifest (`GLOB_FILES`/`GLOB_MAP`), directory listing, PRG builder, size formatting |
| `src/lib/platforms.ts` | `getPlatforms()`, `getPlatformBySlug()` |
| `src/lib/applications.ts` | `getAppsByPlatform()`, `getAppEntry()` |
| `src/lib/a64.ts` | Assembly64 index builder, AQL parser/search, ContentItem serializer, CORS helpers |
| `src/middleware.ts` | Rewrites requests from `ARCHIVE_CONFIG.meatloafHostname` to `/api/meatloaf/<path>` |
| `src/pages/api/meatloaf/[...path].ts` | Meatloaf protocol handler (PRG binary directory listings + raw file serving) |
| `src/pages/leet/search/**` | Assembly64 home server endpoints (see `docs/assembly64-api.md`) |
| `src/pages/files/index.astro`, `[...path].astro` | Human-facing archive browser pages |
| `src/components/FilesTable.astro` | File listing table with ML load-command and download buttons |
| `src/components/AppCard.astro` | Application card on platform listing pages |

## Assembly64 index

`getA64Index()` in `src/lib/a64.ts` builds the searchable index from
`getCollection('applications')`, filtered to `A64_PLATFORMS` (`c64`, `c128`,
`geos`, `cpm` — the platforms the official client supports). `CATEGORY_MAP`
maps application slugs to Assembly64 categories; entries not listed default
to `misc` (id 12). The index is memoized per Lambda/process lifetime in a
module-level `_cache` — it does **not** auto-invalidate, so a redeploy is
needed to pick up new content in production.

`numId` (sequential integer assigned at index-build time, sorted by slug) is
what the Assembly64 client uses as `ContentItem.id` and sends back in all
follow-up requests — `findEntry()` accepts either this numeric id or the
slug.

`toContentItem()` returns `category: numId + CATEGORY_ID_OFFSET (1000)` —
this is a screenshot cache-key trick (see `docs/assembly64-api.md`), not the
real category integer. The real category lives on the internal `A64Entry`
and is used for AQL `category:` filtering via `CATEGORY_KEY_TO_INT`.

## Meatloaf protocol

`buildPrg()` (in both `src/lib/files.ts` and inlined in the meatloaf route)
constructs a Commodore BASIC v2 PRG binary (load address `$0401`) that the
Meatloaf firmware renders as a disk directory. Filenames are uppercased;
characters with no clean PETSCII equivalent (`\ \` { } [ ]`) are remapped —
underscore is intentionally left alone so filenames stay round-trippable.

Routing: requests to `ARCHIVE_CONFIG.meatloafHostname` are rewritten by
`src/middleware.ts` to `/api/meatloaf/<path>` before reaching the handler.
The handler then emits a path-only `Meatloaf-Debug` header (no
`/api/meatloaf/` prefix) so firmware-constructed file URLs stay relative to
that hostname — sending a full `https://` URL in this header breaks
`ML:shortcode/filename` loading on firmware v1.4.

## File serving — Lambda vs dev

`findFilesRoot()` checks for a local `public/files/` directory on the
filesystem. In dev this exists and files are read/stat'd directly. In a
Lambda deployment (Amplify, or any platform where the function package
doesn't include `public/files/`), this returns `null` and the code falls
back to the build-time `GLOB_MAP` (CDN URLs) with `fetch(..., {method:
'HEAD'})` for sizes and a normal `fetch()` for content. This dual-path
pattern appears in `src/lib/files.ts`, the meatloaf endpoint, and several
`leet/search/*` routes — keep both paths in sync if you change one.

## Adding a new application entry

1. Create `src/content/applications/<slug>.mdoc` (slug = lowercase directory
   name you'll use).
2. Set `platform` to a slug that exists in `src/content/platforms/`.
3. Put the downloadable files in `public/files/<platform>/<slug>/`.
4. If you want Assembly64 indexing, ensure `platform` is one of
   `A64_PLATFORMS` and optionally add the slug to `CATEGORY_MAP` in
   `src/lib/a64.ts` (otherwise it defaults to `misc`).
5. For an Assembly64 screenshot, add `public/a64-screenshots/<slug>.png`.

## Known gotchas

- Global CSS rule `code { display: block; ... !important }` (in
  `src/styles/global.css`) turns any bare `<code>` element into a styled
  block — components needing inline code styling override it locally.
- `e.id` from `getCollection()` includes the `.mdoc` extension — always
  strip it (`.replace(/\.mdoc$/, '')`) before comparing to folder names or
  external slugs.
- `assetsInclude` in `astro.config.mjs` must list every binary extension you
  serve, or Vite tries to parse those files as source code at build time.
- `<script define:vars={...}>` blocks in `.astro` files are inlined as plain
  JS, not processed by esbuild — don't use TypeScript-only syntax (type
  annotations, `as Foo` casts) inside them.
