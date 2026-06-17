# Deployment

## Reference deployment: AWS Amplify Hosting

The starter ships with `astro-aws-amplify` as its adapter, matching the
reference IDreamtIn8Bits.com deployment.

### Adapter patch

`astro-aws-amplify@0.4.0` was written against an Astro 4 API
(`astro/app/entrypoint`) that Astro 5 removed. `patches/astro-aws-amplify+0.4.0.patch`
(applied automatically via `patch-package` on `npm install`, see the
`postinstall` script in `package.json`) rewrites `node_modules/astro-aws-amplify/src/server.ts`
to export `start(manifest)` using `NodeApp` from `astro/app/node` instead.

`package.json` pins the dependency to the **exact** version `0.4.0` (not
`^0.4.0`) because the patch is a literal text diff against that version's
source — `0.4.1` still has the same broken Astro 4 API call but with enough
unrelated changes that `patch-package` fails to apply on top of it. If you
bump the pin, regenerate the patch: edit
`node_modules/astro-aws-amplify/src/server.ts` by hand to match the fix,
then run `npx patch-package astro-aws-amplify`.

If you upgrade to (or switch to) an adapter version with native Astro 5
support, delete the patch file and the `postinstall` script.

### Lambda has no filesystem access to `public/files/`

This is the single most important caveat for this starter. On Amplify (and
most other serverless/Lambda-style hosts), the function package does not
include your static assets — those are served straight from
S3/CloudFront. That means at request time, `fs.readFileSync` /
`fs.statSync` calls against `public/files/...` fail in production even
though they work fine in `npm run dev`.

Every piece of code that touches files (`src/lib/files.ts`,
`src/pages/api/meatloaf/[...path].ts`, the `leet/search/*` routes) handles
this with the same pattern:

1. `findFilesRoot()` checks if a local `public/files/` directory exists on
   the running filesystem. In dev, yes — read directly.
2. If not (Lambda), fall back to `GLOB_MAP` — a `relPath → CDN URL` map
   built at **compile time** via `import.meta.glob('../../public/files/**/*',
   { eager: true, as: 'url' })`. Vite/esbuild resolves this glob during the
   build, when the files *are* available, and bakes the resulting CDN URLs
   into the bundle.
3. For file sizes, issue a `HEAD` request to that CDN URL. For file bytes,
   a normal `fetch()`.

If you deploy to a platform where your function *does* have filesystem
access to `public/files/` (e.g. a plain Node server, `@astrojs/node`
adapter, most VPS/container deployments), `findFilesRoot()` succeeds and
the whole CDN-fallback path is simply never used — no extra configuration
needed.

### Swapping the adapter

Any Astro SSR adapter works:

```bash
npm uninstall astro-aws-amplify
npm install @astrojs/node    # or @astrojs/netlify, @astrojs/vercel, etc.
```

Update the `adapter` import/call in `astro.config.mjs`, then delete
`patches/astro-aws-amplify+0.4.0.patch` and the `postinstall` script in
`package.json` (only needed for the Amplify adapter patch).

## CloudFront / CDN URL pattern

On Amplify, static assets under `public/` are served from S3 via
CloudFront with long-lived cache headers. The `GLOB_MAP` URLs baked in at
build time are relative paths that Amplify's CDN resolves — no extra CDN
configuration is required beyond the default Amplify Hosting static-asset
behaviour.

## Alternatives

- **Netlify / Vercel**: both have first-party Astro adapters
  (`@astrojs/netlify`, `@astrojs/vercel`) and similar Lambda-style
  filesystem limitations — the `GLOB_MAP` fallback applies equally there.
- **Node / container deployment**: use `@astrojs/node` in `standalone`
  mode. If `public/files/` is deployed alongside the server (the common
  case for a container image), the filesystem path is used directly and
  performance is slightly better (no CDN round-trip for sizes).
