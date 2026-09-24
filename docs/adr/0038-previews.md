# ADR-0038: Previews

- Status: Proposed
- Date: 2026-09-24
- Deciders: maintainer
- Spec sections affected: 6.3 (nb-fs, nb-preview), 6.7, 7.6 (FR-PRV-03, FR-PRV-05), 8, 10.1 (NFR-PERF-08); gates S3-G08, S3-G09, S3-G13

## Context

S3-T10 implements spec 8's previews for every type, each within its bounds. ADR-0014 already settled the rendering route: a Rust thumbnail for raster images, pdf.js for PDF, and `<img>` for SVG. ADR-0037 added the thumbnail cache. The following were still open when this task started:

- how the webview gets a file
- which files it may get
- where each bound is enforced
- what a failure shows
- how to test two gates whose commands have no harness:
  - S3-G09 names `pnpm test:e2e`, but the desktop package has no e2e script.
  - S3-G08 asks for the memory increase to be measured.

## Decision

1. **Scope.** This task covers captured versions only; linked artefacts show details only.
   - It ships the `nb-preview` engines, the Tauri commands, and the webview feature `features/preview` (views, thumbnails, hooks).
   - The preview panel that hosts them is S3-T11.
   - A linked artefact's file is outside the project. Spec 6.7 keeps the asset protocol to the thumbnail cache and `evidence/` and `methods/`, and no command yet resolves `source.root` through external roots. Until one does, linked artefacts get the "other" view with a sentence saying why.
2. **Only version files can be named, and `nb-fs` opens them.**
   - `ProjectRoot::open_version_file` accepts only `_notebook/experiments/<experiment>/{evidence,methods}/…`.
   - It canonicalises the path and checks the resolved path again against the same pattern. A link can therefore reach neither a notebook data file nor anything outside `_notebook/`.
   - It returns the open file, its length and its resolved path, and never writes.
   - The commands take a validated `VersionPath` and a `Sha256Hex`, never free text.
3. **Rust enforces every bound; the webview enforces none.**

   | Type | Where | Bound |
   | --- | --- | --- |
   | Raster thumbnail | `nb_preview::raster` | File > 200 MB refused before reading. Declared pixels > 100 MP refused from the header, before decoding. `image`'s 512 MiB allocation limit stays as a second guard. The first TIFF page only. |
   | Table | `nb_preview::table` | `Read::take` of 256 KiB, or 8 MiB expanded, measured after gzip decompression (`MultiGzDecoder`, so multi-member files work). 200 or 2,000 rows, 50 columns. A row cut at the limit is dropped. Dimensions only when the whole file was read. |
   | Text | `nb_preview::text` | 1 MiB, 500 lines. |
   | Notebook | `nb_preview::notebook` | 1 MiB: the whole file if smaller, or else its last 1 MiB, where nbformat writes the top-level `metadata`. |
   | SVG, image, PDF | `nb_preview::webview` | SVG 20 MB and full-size image 200 MB, checked before the file is placed in the asset scope. PDF has no size bound, because pages load on demand. |

   "MB" is decimal, as spec 8 writes it. "KiB" and "MiB" are binary.
4. **Encodings.** Encodings are detected in Rust:
   - UTF-8, or UTF-8 with its byte-order mark removed;
   - otherwise Windows-1252, through a 32-entry table for 0x80–0x9F (WHATWG mapping) rather than `encoding_rs`.

   A UTF-8 character cut in two by the read limit is dropped, and the text is still treated as UTF-8.
5. **The asset protocol, one file at a time.**
   - `tauri.conf.json` enables the protocol with an **empty static scope**.
   - At start-up the thumbnail folder is allowed, non-recursively.
   - `preview_asset` allows exactly the one resolved file it has just checked.
   - `connect-src` gains `asset: http://asset.localhost`, so pdf.js can fetch byte ranges.
   - No other CSP directive changes. `script-src` stays `'self'`, and `img-src` still has no `data:` or `blob:`. Both are now asserted in `csp.test.ts`.
6. **Rust returns the asset URL.** ESLint lets only the generated `ipc/` import `@tauri-apps/api/core`, which holds `convertFileSrc`. The commands therefore return the URL, built exactly as Tauri 2.11's `convertFileSrc` builds it:
   - the path passed through `encodeURIComponent`;
   - under `http://asset.localhost/` on Windows, since `useHttpsScheme` is off;
   - under `asset://localhost/` elsewhere.
7. **The preview follows the extension, and the recorded type is a fallback.** Spec 8's table is keyed by extension. `inferArtefactType` looks only at the last extension, so it records `counts.csv.gz` as `other`. Scripts and text with unlisted extensions (for example `.jl`, which inbox import records as `script`) still get the bounded text preview.
8. **SVG and HTML.**
   - An SVG only ever reaches the page as an `<img src>`. Its text is never read or placed in the DOM.
   - HTML is never read. Its view has details and one action, Open in browser.
   - pdf.js runs with automatic fetching and streaming off, so it requests pages as they are drawn. It is imported lazily.
9. **Failures (FR-PRV-05).** Each command failure has a message key, and the webview adds `renderFailed` for an `<img>` error or a pdf.js failure. Each failure offers one recovery:
   - **Try again** for passing problems: project or file unavailable, file missing, cache unavailable, internal.
   - **Open with system application** for problems with the file itself: too large, too many pixels, unreadable, not previewable, could not be drawn.
10. **Actions outside the application.** Open in browser, Open with system application and Open in VS Code are callbacks. S3-T11 wires them to the opener (FR-PRV-02).
11. **Thumbnails.**
    - Raster images use the Rust thumbnail through the cache, keyed by the version's recorded hash. The file is still opened first, so a version whose file is gone is reported as missing, not served from the cache.
    - SVG is its own thumbnail through `<img>`.
    - PDF draws its first page at 256 px with pdf.js and is not cached, as agreed at planning.
    - Everything else, and any failure, shows the type icon.
12. **S3-G09 is tested at component level (`preview-security.test.tsx`), plus CSP assertions.** The tests check:
    - an SVG renders as exactly one `<img>` and nothing inline or embedded;
    - its text is never requested;
    - HTML makes no command call and renders no `iframe`, `object`, `embed`, `img`, `canvas` or `srcdoc`, only Open in browser.

    The e2e command still needs a harness. `tauri-driver` has no macOS support, so that is a separate decision.
13. **S3-G08's memory criterion is met by construction, not measured.**
    - The byte-counting reader proves no more than the bound is read, for:
      - a synthetic 2 GB CSV;
      - a gzip file that expands to 2 GB;
      - a real 2 GB file made with `set_len`.
    - At most 8 MiB of raw bytes is held. Decoding Windows-1252 is at most three bytes per byte, and the raw bytes are dropped once decoded. The output is capped at 2,000 × 50 cells from that text. The peak is therefore well under 50 MB.
    - Measuring allocations would need a `#[global_allocator]`. That needs `unsafe`, which the workspace forbids, or a new dev-dependency.

## Dependencies

- **`nb-preview` gains:**
  - `csv` 1.4.0 and `flate2` 1.1.10, both named in spec 6.1. Both were already in `Cargo.lock` through typst.
  - `serde_json`, already in the workspace.
  - The `image` features `gif` and `webp` (already compiled through typst), `bmp` (no crate) and `tiff`.
- **`tiff` adds two new crates:** `tiff` 0.11.3 (MIT, image-rs) and `fax` 0.2.7 (MIT).
- **Tauri's `protocol-asset` feature adds `http-range` 0.1.5 (MIT).**
- **Dev-dependencies:** `tiff` in `nb-preview`, to write a multi-page TIFF, and `tempfile` in the desktop crate. Both are already locked.
- `cargo deny check` passes. The release dates of the three new crates were not checked here.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Send file bytes over IPC and show them as `blob:` URLs | Needs `blob:` in `img-src` and `connect-src`, and copies whole files through IPC. The asset protocol is what spec 6.7 names. |
| Put `$APPCACHE/**` and project globs in the static asset scope | The project folder is only known at run time, and a glob would allow far more than the one file being previewed. |
| Call `convertFileSrc` in the webview | Only `ipc/` may import `@tauri-apps/api/core`, and `ipc/` is generated. |
| `encoding_rs` for Windows-1252 | It is locked but a new dependency of `nb-preview`. The table is 32 entries and tested. |
| Decide the preview from the recorded type | Gzip tables would be `other`, and spec 8 is keyed by extension. |
| Read Rmd and qmd front matter for language and kernel | That is YAML front matter, and rule 2 keeps its parsing in `packages/format`. The extension gives R for Rmd; Quarto shows no language. |
| Cache PDF thumbnails | The PNG would have to be sent back from the webview through an extra command. Deferred. |
| Build the WebDriver e2e harness now | New dev-dependencies, and no macOS support in `tauri-driver`. |

## Consequences

- **Gate rows need updating with the workbook.**
  - S3-G09's command (`pnpm test:e2e -- preview-security`) has no harness. The component and CSP tests cover its criteria in jsdom, not in WebView2 or WKWebView.
  - S3-G08's memory figure is argued, not measured.
- **Linked artefacts have no preview** until a resolver for `source.root` exists. Their Rust-side previews could be added then, without the asset protocol.
- **`inferArtefactType` still records `.csv.gz` as `other`.** That is harmless for previews, but worth fixing when inbox import is next changed.
- **The allowed files accumulate.** Asset scope entries added by `preview_asset` persist for the run. Each is a file the person chose to preview.
- **Tests:**
  - `crates/nb-fs/tests/open_version_file.rs` and a preview step in `fs_safety.rs`.
  - `crates/nb-preview/tests/{table,text,notebook,raster}_preview.rs` and `webview_bounds.rs`. The `bounds` tests are the S3-G08 filter.
  - `src/commands/projects/preview/` unit tests.
  - `features/preview/**/*.test.ts(x)` and `csp.test.ts`.
- **Not tested:**
  - pdf.js page drawing and the asset protocol in a real webview.
  - Previews on macOS.
  - Both are left to S3-G13's manual check.
