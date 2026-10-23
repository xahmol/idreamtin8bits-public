# Deployment

## Reference deployment: AWS Amplify Hosting

The starter ships with `astro-aws-amplify` as its adapter, matching the
reference IDreamtIn8Bits.com deployment.

### Adapter patch

`astro-aws-amplify@0.6.0` supports Astro 6 and 7. One problem remains on
Amplify: the compute proxy does not forward the public host name, so Astro
builds every request URL with the host `localhost`.
`patches/astro-aws-amplify+0.6.0.patch` (applied automatically via
`patch-package` on `npm install`, see the `postinstall` script in
`package.json`) rewrites such URLs to the `site` URL from
`astro.config.mjs`, so absolute URLs built from the request are correct.

`package.json` pins the adapter to the **exact** version `0.6.0`, because
the patch is a literal text diff against that version's source. If you bump
the pin, re-apply the change by hand in
`node_modules/astro-aws-amplify/src/server.ts`, then run
`npx patch-package astro-aws-amplify`.

### Runtime packages in the Lambda bundle

The Amplify compute bundle only contains `.amplify-hosting/compute/default`.
Packages the server bundle still imports at run time must be copied into its
`node_modules`. Do this in the Amplify build settings (`amplify.yml`) as a
`postBuild` step:

```yaml
    postBuild:
      commands:
        - node scripts/copy-runtime-deps.mjs
```

The script reads the actual imports of the bundle and copies those packages
plus their dependencies, so the list cannot go out of date when Astro or
Vite change what they bundle.

### Node.js version

Build and run on Node.js 24 (`.nvmrc`; the adapter is configured with
`runtime: 'nodejs24.x'`, the newest runtime Amplify offers for SSR). In
`amplify.yml`, use `nvm install 24` in `preBuild`.

### Security headers

`src/lib/security.ts` (called from `src/middleware.ts`) adds HSTS,
`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
`Permissions-Policy` and `Cross-Origin-Opener-Policy` to server-rendered
responses and rejects cross-site POST/PUT/PATCH/DELETE requests.
`customHttp.yml` sets the same headers for static files on Amplify.

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
   { eager: true, query: '?url', import: 'default' })`. Vite/esbuild resolves this glob during the
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
`patches/astro-aws-amplify+0.6.0.patch`, the `postinstall` script in
`package.json` (only needed for the Amplify adapter patch) and the
`runtime` option in `astro.config.mjs`.

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
