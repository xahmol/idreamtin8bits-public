# Configuration

`src/config/retro-archive.ts` is the single file you should need to edit to
make this archive yours.

```ts
export const ARCHIVE_CONFIG = {
  a64Group:   'mygroup',
  a64Handle:  'myhandle',
  a64Country: 'US',

  meatloafHostname:  'ml.mysite.com',
  meatloafShortcode: 'MYSITE',

  siteUrl: 'https://mysite.com',
} as const;
```

| Field | Used for | Effect |
|---|---|---|
| `a64Group` | Assembly64 `ContentItem.group` | Shown in the client's Group field/filter for every entry; the value users type into `(group:"...")` to find your server's entries |
| `a64Handle` | Assembly64 `ContentItem.handle` | Shown as the releaser handle in the client |
| `a64Country` | Assembly64 `ContentItem.country` | ISO 3166-1 alpha-2 code shown in the client |
| `meatloafHostname` | `src/middleware.ts`, `src/pages/api/meatloaf/[...path].ts` | The subdomain Meatloaf devices connect to. Must match your DNS record exactly (compared against `request.headers.get('host')`) |
| `meatloafShortcode` | `src/components/FilesTable.astro`, `src/pages/files/index.astro` | The `ML:` shortcode shown in copyable `LOAD` commands — only useful once registered with [meatloaf.cc](https://meatloaf.cc) |
| `siteUrl` | `src/layouts/Layout.astro` (canonical tag), files pages, Assembly64 Server Link copy button | Canonical base URL, no trailing slash |

Also update `site` in `astro.config.mjs` to match `siteUrl` — Astro uses
this for its own absolute-URL generation, separate from `ARCHIVE_CONFIG`.

## Binary asset types

Vite only treats known web-asset extensions as binary by default. Every
retro file extension you plan to serve via `import.meta.glob(..., { as:
'url' })` must be listed in `vite.assetsInclude` in `astro.config.mjs`, or
the build tries to parse the file as source code.

The default list covers the common Commodore formats (PRG, D64 family, T64,
TAP, CRT, SID, BAS, BIN, ROM). Add more as needed, e.g. for other 8-bit
platforms.

`A64_FILE_EXTS` in `src/lib/a64.ts` is a separate, narrower list — only
files with these extensions are surfaced through the Assembly64 file list
for an entry, even if other files exist in that entry's directory.
`MEATLOAF_EXTS` in `src/lib/files.ts` is the equivalent list controlling
which files show the Meatloaf "ML" load-command button in the file table.

## Optional: Keystatic CMS

This starter ships with hand-edited `.mdoc` files for the `platforms` and
`applications` content collections — no CMS is wired in. If you want a
Git-backed editing UI:

1. `npm install --legacy-peer-deps @keystatic/astro @keystatic/core`
2. Add a `keystatic.config.ts` defining the `platforms` and `applications`
   collections (paths: `src/content/platforms/*`, `src/content/applications/*`;
   image directory: `src/assets/images/applications/` if you add image
   uploads).
3. Add the `keystatic()` integration to `astro.config.mjs`.
4. For production GitHub-backed storage, set the three `KEYSTATIC_GITHUB_*`
   / `KEYSTATIC_SECRET` env vars (see `.env.example`) and reference them in
   `astro.config.mjs`'s `vite.define` block the way the original
   IDreamtIn8Bits site does.

Local dev works with Keystatic's local filesystem storage mode with no env
vars at all.
