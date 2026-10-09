# ADR-0054: The HTML export is a set of static, escaped pages with reduced figures

- Status: Proposed
- Date: 2026-10-09
- Deciders: maintainer
- Spec sections affected: 7.12 (FR-ARC-05), 5.1, 8

## Context

S6-T05 exports "static HTML with downscaled figures, sampled tables and
relative links to originals" (FR-ARC-05, Must). The spec does not say where the
pages go, who builds them, how researcher text is made safe, or how a figure is
reduced given that only `packages/format` parses notebook files (AGENTS.md
rule 2) and only `nb-fs` writes (rule 1).

## Decision

1. **Not a format change.** The export is derived output under
   `_notebook/exports/html/`, like the manifest (ADR-0051) and git bundles
   (ADR-0053). Nothing in `artefacts.yaml` or any notebook file changes, so
   there is no version increment or migration.
2. **Pages are built in `packages/format`.** `renderHtmlExport` is pure: it
   takes the arranged project, its name and locale, and what was prepared for
   each figure or table, and returns `{ name, html }` pages. It reads no
   clock, no file and no network. Markdown is parsed by the editor's own
   parser (`parseSectionMarkdown`), so the export and the application agree
   on what the text means. Rust never parses or builds notebook text.
3. **Pages.** `index.html`; one page per question (`Q-001.html`) with its
   Motivation and experiments; one per experiment (`EXP-001.html`) with its
   sections, artefacts and Literature. Experiments with no question are listed
   on the index. A question or experiment that shares an ID with an earlier
   one (spec P6) or whose page name is taken is **not exported and is named
   on the index**, never dropped silently.
4. **Escaping.** All text from the project is escaped as element content or a
   quoted attribute. Output is built from the parsed tree, so raw HTML,
   tables and other constructs the editor keeps as passthrough are shown as
   the text written inside `<pre>`, never as markup. Only `http`, `https` and
   `mailto` links become links. No script, inline event handler, remote font,
   remote image or network address is written; one inline stylesheet is.
5. **Figures.** The newest version of each raster `image` artefact is reduced
   by `nb-preview` to fit 800 px, never enlarged, and written as
   `exports/html/assets/<sha256>-800.png` through `nb-fs`. Identical content
   is written once. The page shows the reduced copy inside a link to the
   original. `svg` artefacts are vector, so they are not reduced; the page
   shows the original in an `<img>`, which a browser never lets run scripts.
   PDFs, scripts and other types are listed with a link only.
6. **Tables.** The newest version of each `table` artefact is sampled by
   `nb-preview` (the header and first 200 rows, at most 50 columns, from the
   first 256 KiB), so a huge table cannot make a huge page. The page says when
   rows or columns are left out. A table type with no sampler (for example a
   spreadsheet) is linked only.
7. **Links to originals.** Pages sit in `_notebook/exports/html/`, so a
   captured version is `../../experiments/<folder>/<file>`, and a linked
   artefact whose source root is `project` is `../../../<path>`. A linked
   artefact in an external root has no portable relative path, so its path is
   named and not linked. Every segment is percent-encoded. Every version of
   an artefact is linked, not only the newest.
8. **Citations.** Inline citations show their citekeys, as in the stored text.
   The experiment's stored Literature block is shown as written, under its
   own heading. The export does not run the citation engine, so it never
   disagrees with `experiment.md` and needs no worker; a reader who wants
   formatted citations uses the PDF/A export (S6-T06).
9. **Failures are named.** Each figure or table has its own answer
   (`image`, `table`, `unsupported`, `missing`, `unavailable`, `writeFailed`,
   `refused`), by position, with no system text. One that cannot be prepared
   does not stop the others; its page says "Preview not available" and still
   links the original. A reply that does not account for every request, or
   for every page, is a failure, not a shorter list.
10. **How it is written.** Pages are written with `ProjectRoot::write_atomic`,
    the **index last**, so an interrupted run never leaves a new index linking
    pages that are not there. A page name is letters, digits, `-` and `_`
    followed by `.html`; anything else is refused. A hash that is not a
    SHA-256 is refused before it can name a file.
11. **Stale pages.** A re-run replaces pages of the same name. A page for an
    experiment that was since deleted stays, because the application never
    deletes (`nb-fs` only moves to the trash). The index lists only what the
    current export holds.
12. **Optional and locked.** Nothing is written unless the person asks. Both
    commands need the project lock, so a read-only project cannot export.
13. **Not part of Verify.** Exports are not captured files and are not in
    `manifest.csv`.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Build the pages in Rust | Needs the notebook text parsed in Rust, against rule 2, and a second Markdown renderer that could disagree with the application. |
| Pass raw HTML from Markdown through | A researcher's note, or pasted text, could run script when the export is opened. |
| Inline figures as data URIs | One page could reach tens of megabytes; reduced files are written once and shared. |
| Embed the original SVG markup | SVG can carry script. As an `<img>` it cannot. |
| Format citations with the citation engine | Needs the worker and the style, and could disagree with the stored Literature block. |
| Delete the previous export first | The application never deletes; a failed run would leave nothing. |

## Consequences

- **No new external dependency.** `nb-archive` now depends on `nb-preview`
  (an internal crate) and, for its tests only, on `image` at the version
  `nb-preview` already pins, with only the PNG feature.
- **Tests.** `htmlMarkdown.test.ts`, `htmlExport.test.ts`,
  `htmlExport.property.test.ts` (hostile wording never becomes markup),
  `htmlExport.golden.test.ts` with `__golden__/export-*.html` (S6-G02),
  `nb-archive/tests/html_export.rs` (reduction, no enlargement, sampling, cut
  tables, unsupported, missing, refused paths and hashes, nothing outside
  `exports/html/` changes, page names), command tests in
  `commands/projects/html_export.rs`, `model/htmlExport.test.ts` and
  `HtmlExportPanel.test.tsx`.
- **Protected paths.** `crates/nb-archive/` and this ADR.
- **Wording.** The pages' own words live in `htmlExportText.ts`, in British
  English. They are fixed in the export and not taken from the interface's
  message files, because the export outlives the application.
- **Not tested.** Opening the pages in a browser (golden files fix their
  structure, not their look); multi-page TIFF, CMYK and 16-bit images beyond
  what `nb-preview` already covers; a very large project (page size grows with
  the number of artefacts); Windows only.
