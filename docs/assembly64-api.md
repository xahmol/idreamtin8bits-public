# Assembly64 Home Server

Technical reference for the Assembly64 home server protocol implemented under
`src/pages/leet/search/**`.

---

## What this is

The [Assembly64](https://assembly64.hackerswithstyle.se/assembly/index.html)
PC client can browse and download files from custom "home servers" in
addition to the official catalog. This starter implements that protocol so
your archive is browsable directly inside the client.

**Important**: custom home server support is currently only available in the
Assembly64 **PC client**, not the official C64 Ultimate II+ firmware.

Only applications whose `platform` is `c64`, `c128`, `geos`, or `cpm`
(`A64_PLATFORMS` in `src/lib/a64.ts`) are indexed — these are the platforms
the official client supports.

---

## User setup

1. Open Assembly64 → **Main** tab → **AQL Search** section.
2. Find the **Server** field → click **Edit** → **Add Server**.
3. **Server Link**: your `ARCHIVE_CONFIG.siteUrl` (must be `https://`).
4. **Description**: anything, e.g. your `a64Handle`.
5. Leave **Public Server** unchecked unless you want it listed publicly.
6. Select your server from the dropdown and search
   `(group:"<your a64Group>")` to see all entries.

---

## Endpoint overview

| Method | Path | Description |
|---|---|---|
| GET | `/leet/search/aql/presets` | Filter preset definitions |
| GET | `/leet/search/aql[/{offset}/{limit}]?query=` | Search entries (AQL) |
| GET | `/leet/search/entries/{itemId}/{categoryId}` | File list for an entry |
| GET | `/leet/search/entry/{itemId}/{categoryId}/{fileId}` | Single file entry |
| GET | `/leet/search/meta/{itemId}/{categoryId}` | Entry metadata |
| GET | `/leet/search/metadata/{itemId}/{categoryId}` | Entry metadata (Docker compat) |
| GET | `/leet/search/screenshot/{itemId}/{categoryId}` | Screenshot (302 redirect) |
| GET | `/leet/search/bin/{itemId}/{categoryId}/{filename}` | File download |
| GET | `/leet/search/categories` | Category list |
| GET | `/leet/search/compotypes` | Compo types (empty) |

CORS headers (`Access-Control-Allow-Origin: *`) are included on all responses.

---

## `GET /leet/search/aql/presets`

Returns the filter preset list used to populate Assembly64 UI dropdowns —
categories, years (1980–current), ratings (1–10). See `A64_PRESETS` in
`src/lib/a64.ts`.

---

## `GET /leet/search/aql[/{offset}/{limit}]?query=`

Searches the index. Returns an array of `ContentItem` objects.

**Path parameters** (optional): `{offset}` (default 0), `{limit}` (default
100, max 500).

**Query parameter**: `query` — an AQL expression, e.g.
`(group:"mygroup") & (category:tools)`.

```json
[
  {
    "id": "0",
    "name": "Example Demo",
    "category": 1000,
    "group": "mygroup",
    "handle": "myhandle",
    "year": 2026,
    "updated": "2026-01-01",
    "released": "2026-01-01",
    "country": "US",
    "event": "",
    "rating": null,
    "place": null,
    "compo": null,
    "siteCategory": null,
    "siteRating": null
  }
]
```

`id` is a sequential integer (as a string), assigned at index-build time,
sorted alphabetically by slug — this is what the client sends back in all
subsequent requests. `category` here is `numId + 1000`, **not** the real
category integer (see "Screenshot cache key design" below).

### AQL syntax

```
(group:"mygroup") & (category:tools)
```

| Key | Example | Behaviour |
|---|---|---|
| `name` | `(name:"demo")` | See "String filter matching" below |
| `category` | `(category:demos)` | Exact match by `aqlKey` string |
| `type` | `(type:d64)` | File extension without dot — matches if any file has it |
| `group` | `(group:mygroup)` | See "String filter matching" below |
| `handle` | `(handle:myhandle)` | See "String filter matching" below |
| `year` | `(year:2024)` | Exact year match |
| `country` | `(country:us)` | Exact match, case-insensitive |
| `order` | `(order:asc)` | Sort results by name; `asc` or `desc` |

`repo` is accepted but unused (all entries come from one server).

### String filter matching (`name`, `group`, `handle`)

> **Source note**: this section documents behaviour reported directly by the
> Assembly64 creator about the official reference home server (Docker image
> `freabemania/assembly64-home-server`), not something independently
> confirmed from published documentation. Treat the wildcard/exact-match
> details as best-effort protocol compatibility, and re-verify against a
> live Assembly64 client if exact behaviour matters for your deployment.

The reference server's stated semantics are: a bare value does an **exact**
match, `%` is a SQL-LIKE wildcard (`a%` matches any name starting with "a"),
and `@` alone means "match everything" (ignore this filter).

This starter implements all three on top of (not instead of) substring
matching, to stay compatible with simpler clients/queries that expect a bare
value to behave as a "contains" search:

1. `@` → filter ignored, matches everything.
2. Value containing `%` → SQL-LIKE translation (`%` → regex `.*`, full match,
   case-insensitive).
3. Otherwise → case-insensitive substring match (original behaviour).

See `matchesStringFilter()` in `src/lib/a64.ts` if you need to change this —
e.g. to switch step 3 to exact-match if you confirm that's what the official
client actually sends.

---

## `GET /leet/search/entries/{itemId}/{categoryId}`

File list for an entry.

```json
{
  "contentEntry": [
    { "path": "example.prg", "id": 0, "size": 1234, "date": 1735689600000 }
  ],
  "isContentByItself": true
}
```

`size` comes from `fs.statSync` in dev, a CDN `HEAD` request in production.
`date` is a Unix epoch millisecond timestamp. `isContentByItself` is `true`
when the entry has exactly one file.

---

## `GET /leet/search/entry/{itemId}/{categoryId}/{fileId}`

Single file entry by 0-based index — same shape as one element of
`contentEntry` above.

---

## `GET /leet/search/meta/{itemId}/{categoryId}` and `/metadata/...`

Both paths serve identical handlers — `/meta/` matches the official
production API, `/metadata/` matches the Docker reference server.

```json
{
  "name": "Example Demo",
  "group": "mygroup",
  "handle": "myhandle",
  "releaseDate": "2026-01-01",
  "event": "",
  "rating": null,
  "url": "https://mysite.com/files/c64/example-demo/"
}
```

`releaseDate` must be camelCase — the Assembly64 client's Jackson
deserializer is not case-insensitive. `url` opens the application's page on
your site from the Assembly64 detail panel.

---

## `GET /leet/search/screenshot/{itemId}/{categoryId}`

Responds with HTTP 302 to `/a64-screenshots/{slug}.png`, or 404 if the file
doesn't exist. `{categoryId}` is the client's local screenshot cache key —
see below for why it must be unique per entry.

---

## `GET /leet/search/bin/{itemId}/{categoryId}/{filename}`

Downloads a file as `application/octet-stream`. `{filename}` may be the
file's `path` from a `contentEntry`, an integer file index, or the special
value `na` (returns the first file — used by some clients for single-file
entries).

In dev, files are read with `fs.readFileSync`. In a Lambda-style deployment,
they're fetched from the CDN via the build-time `GLOB_MAP` manifest.

---

## `GET /leet/search/categories` / `GET /leet/search/compotypes`

Static category list (matches the official OpenAPI schema) and an empty
array respectively — this starter has no compo data.

---

## Screenshot cache key design

The Assembly64 client caches screenshots keyed by the `categoryId` segment
of the screenshot URL. If two entries share a `categoryId` they'd share one
cached image. `toContentItem()` returns `numId + CATEGORY_ID_OFFSET` (1000)
as `category` specifically to give every entry a unique cache key — this is
**not** the real category integer used for AQL `category:` filtering (that
lives on the internal `A64Entry.category` / `CATEGORY_KEY_TO_INT`).

---

## Adding entries to the index

1. Create `src/content/applications/<slug>.mdoc` with `platform` set to one
   of `c64`, `c128`, `geos`, `cpm`.
2. Put files in `public/files/<platform>/<slug>/` with an extension in
   `A64_FILE_EXTS` (`.prg .d64 .d71 .d81 .d82 .crt .tap .t64 .sid .g64 .bin`).
3. Optionally add the slug to `CATEGORY_MAP` in `src/lib/a64.ts` — entries
   not listed default to `misc` (id 12).
4. Optionally add `public/a64-screenshots/<slug>.png`.
5. Deploy — the index rebuilds from the content collection automatically.

---

## Implementation notes

- The index is built at request time from `getCollection('applications')` +
  the build-time `GLOB_MAP` file manifest, and memoized in process memory
  for the life of the server/Lambda instance — it does not auto-invalidate,
  a redeploy picks up new content.
- AWS Lambda synchronous responses cap at 6 MB. All standard Commodore file
  formats (PRG, D64/D71/D81, CRT, SID) are well within this.
- `siteImage` (present in the official API schema) is a classpath resource
  name pointing at a provider badge baked into the Assembly64 client JAR —
  it's loaded via `Class.getResource()`, so HTTP URLs don't work. It's
  omitted from all responses here.
