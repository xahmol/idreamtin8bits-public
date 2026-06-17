# Meatloaf Endpoint

Technical reference for `src/pages/api/meatloaf/[...path].ts`, which serves
[Meatloaf](https://meatloaf.cc) Wi-Fi IEC devices.

## Credits

This implementation was built against these public references:

- **Meatloaf** — A Commodore IEC Serial multi-device emulator.
  <https://meatloaf.cc> / <https://github.com/idolpx/meatloaf>
  Copyright © 2022 James Johnston (idolpx), GNU GPL v3.
- PHP reference implementation (directory listing logic, PRG format):
  <https://gist.github.com/idolpx/ab8874f8396b6fa0d89cc9bab1e4dee2>
  Copyright © 2022 James Johnston (idolpx), GNU GPL v3.
- Go reference server (PETSCII conversion, case-insensitive file resolution,
  `Meatloaf-Debug` header format, CMD-style filter syntax):
  <https://github.com/wazp/meatloaf-server>
- C64 BASIC directory PRG binary format: Michael Steil,
  ["LOAD$,8"](https://www.pagetable.com/?p=273).

No code from these projects is copied — only the protocol/format behaviour
they document.

## Protocol summary

Meatloaf devices send GET requests with `User-Agent` containing `MEATLOAF`.
For a directory URL, the server returns a Commodore BASIC v2 PRG binary
(load address `$0401`) that the firmware presents as a disk directory. For a
file URL, it returns the raw bytes with `Content-Length` set — the firmware
needs this to assert IEC EOI on the last byte.

A non-Meatloaf browser hitting the same URL gets a plain HTML placeholder
page instead (or the regular Astro `files/` pages, if you route browsers
there).

## Routing via subdomain

Set `ARCHIVE_CONFIG.meatloafHostname` (e.g. `ml.mysite.com`) and point that
DNS record at your app. `src/middleware.ts` rewrites any request to that
host from `/<path>` to `/api/meatloaf/<path>` before it reaches the route
handler — no other wiring needed. The endpoint is also reachable directly
at `/api/meatloaf/<path>` on the main domain.

### `Meatloaf-Debug` header

This header sets the firmware's internal current-working-directory hint.
Sending a full `https://` URL here confuses the `ML:shortcode/filename`
construction in firmware v1.4 — so when the request came in via the ML
hostname, the handler emits a **path-only** value (e.g. `/c64/`) instead of
`/api/meatloaf/c64/`. Direct full-URL loading
(`LOAD"HTTPS://ml.mysite.com/c64/file.prg",8`) works regardless of this
header.

## PETSCII / case handling

Filenames are sent as uppercase ASCII, which renders as uppercase text in
the C64's default mode — matching the live reference servers. Characters
with no clean PETSCII equivalent (`\` `` ` `` `{` `}` `[` `]`) are remapped
to safe substitutes before display. Underscore is intentionally **not**
remapped, so filenames stay round-trippable for URL construction.

Incoming request paths are lowercased for case-insensitive file resolution
— the firmware may echo back the uppercase filenames it received in the
PRG listing on a subsequent `LOAD`.

## File serving: dev vs production

`findFilesRoot()` looks for a local `public/files/` directory. If found
(dev, or any deployment where the app's filesystem includes the files),
listings and file bytes come straight from `fs`. Otherwise the handler
falls back to the build-time `GLOB_MAP` manifest (CDN URLs from
`import.meta.glob`) — HEAD requests for sizes when building a directory
listing, a normal fetch for file bytes. See `docs/deployment.md` for why
this matters on serverless platforms.

## PRG directory format

`buildDirPrg()` constructs the binary: a header line (disk name, drive ID),
an `[URL]` / `[PATH]` info block, then one line per entry (`DIR` for
directories, file-type tag for files), terminated with a `BLOCKS FREE`
line. Block counts are `ceil(size / 256)`. See the inline comments in
`src/pages/api/meatloaf/[...path].ts` for the exact byte layout — it
follows the PHP reference implementation's structure.

## Security

Directory traversal (`..` segments) is rejected with 403 before any
filesystem or fetch operation runs.
