# ADR-0014: Preview rendering approach for PNG/JPEG, PDF and SVG

- Status: Proposed
- Date: 2026-09-18
- Deciders: maintainer
- Spec sections affected: 8

## Context

S1-T05 spiked whether a Rust-generated thumbnail (PNG/JPEG), pdf.js
(PDF first page) and a plain `<img>` (SVG) can all be shown together in the
Tauri window, as a precondition for the real preview system in Stage 3
(S3-T09, S3-T10).

## Decision

Adopt all three rendering approaches for their respective formats.
Evidence:

- Rust thumbnail: `apps/desktop/src-tauri/crates/nb-preview/src/lib.rs:21-36`,
  `thumbnail_png()` bounds output to a 256px longest edge and never
  upscales; wired through a typed Tauri command
  (`apps/desktop/src-tauri/src/commands/preview.rs:7-8`,
  `preview_thumbnail_png`) with a tauri-specta generated binding
  (`apps/desktop/src/ipc/bindings.ts:13`). 5 Rust tests cover downscale,
  no-upscale, PNG-always-output and corrupt-input error handling.
- PDF: `apps/desktop/src/features/preview-spike/model/pdfFirstPage.ts` uses
  `pdfjs-dist` (exact version 6.3.289) to render page 1 to a canvas.
- SVG: `PreviewSpike.tsx:55-58` renders it through a plain `<img>`, per the
  security requirement that SVG never executes embedded scripts.
- All three are shown together in one feature component
  (`apps/desktop/src/features/preview-spike/PreviewSpike.tsx`).

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| A single unified preview renderer for all formats | Each format has a materially different trust and rendering model (Rust-side raster decode vs. browser-side PDF.js vs. plain image tag for SVG); spec 8's per-format bounded approach is followed instead. |

## Consequences

- Verification only happened on Windows, via
  `pnpm --filter desktop tauri dev` (per the f8fa183 commit message — no
  Mac was available in this environment). Gate test S1-G05 requires
  screenshots on **both** Windows and macOS; that verification is still
  outstanding and should not be marked done from this spike alone.
- A Windows-specific test-binary crash
  (`STATUS_ENTRYPOINT_NOT_FOUND` when `tauri::Wry` is referenced from a
  `cargo test` binary) was found and worked around by moving tests to
  `tests/`; worth watching for recurrence on macOS, where the failure mode
  may differ or not reproduce at all.
- `pdfjs-dist` is pinned at 6.3.289 in `apps/desktop/package.json`.
