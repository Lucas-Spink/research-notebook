# ADR-0056: The project PDF is PDF/A-3b from a fixed Typst template over data, with the notebook's JSON attached

- Status: Proposed
- Date: 2026-10-09
- Deciders: maintainer
- Spec sections affected: 7.12 (FR-ARC-06), 5.1, 8; builds on ADR-0007, ADR-0015
  and ADR-0055

## Context

S6-T06 exports "PDF/A-3b through Typst with notebook.json and bibliography.json
embedded, including a combined project bibliography processed as a fresh
citation context" (FR-ARC-06, Must; AC-15). ADR-0007 fixed the approach (a
committed template, user text only as data) and the S1-T06 spike proved it for
PDF/A-2b with one experiment. The spec does not say what the document contains,
what a "fresh citation context" is, or how the nightly veraPDF job gets its
input given that only `packages/format` parses notebook files (AGENTS.md rule 2).

## Decision

1. **Not a format change.** The PDF is derived output at
   `_notebook/exports/pdf/project.pdf`, like the other exports (ADR-0051, 0053,
   0054, 0055). Nothing in the notebook changes.
2. **PDF/A-3b, with the dated attachments it requires.** `nb-export` exports
   with `PdfStandard::A_3b`. The fixed template attaches `notebook.json`
   (relationship `data`) and `bibliography.json` (relationship `supplement`),
   each with `application/json` and a description. PDF/A needs a document date
   when files are attached, so the date is the `generated` time the input names
   (UTC, to the second), passed in and never read from a clock: the same input
   gives the same bytes.
3. **A fixed template over data (ADR-0007).** `project.typ` is committed source.
   The project is read as `json("/data.json")` from a `World` that serves only
   `/data.json`, `/notebook.json` and `/bibliography.json`. Researcher wording
   cannot become markup; tests use Typst syntax as wording and find it printed
   literally. The template's own headings are fixed British English, because the
   PDF outlives the application.
4. **Built in `packages/format`.** `buildPdfExport` takes the arranged project,
   `project.yaml`, the application version, the formatted bibliography and a
   clock, and returns `pdf-input.json` and the `notebook.json` to embed. The
   embedded `notebook.json` is the one the machine-readable export writes
   (ADR-0055), built with the same single reading of the clock, so the two
   agree. Markdown becomes a small block tree (paragraph, heading, lists, code,
   quote, raw) through the editor's own parser. Raw HTML and tables are carried
   as the text written, and only `http`, `https` and `mailto` links are links.
   Which questions and experiments are included is decided by the same function
   as the HTML and machine-readable exports; the ones left out are named in the
   PDF.
5. **A fresh citation context.** The combined bibliography is formatted once,
   by the citation engine in `packages/citations`, over every exported
   experiment's citations joined in project order (`projectCitationClusters`).
   So sources are numbered from 1, each appears once however many experiments
   cite them, and the experiments' own Literature blocks (each a separate
   context, FR-CIT-09) do not decide it. Rust never formats citations. The style
   is the project's (`citation_style`), with the bundled style as the fallback
   the Literature block already uses. If the bibliography cannot be formatted,
   no PDF is written.
6. **`bibliography.json` is embedded as stored.** The application reads the
   file's text and passes it through unchanged. A project with none embeds `[]`.
7. **Figures are not included.** ADR-0015 rules out PDF figures under PDF/A, and
   rasterising or vectorising every figure is its own piece of work. Artefacts
   are listed with their type, role, every version, size, capture time and
   SHA-256, and linked files with their path. Figures can be added later without
   changing the rest. A reader who wants them has the captured files and the
   HTML export.
8. **Fonts.** Only Typst's embedded fonts are used (no system fonts, so the
   output does not depend on the machine). Text in a script they do not cover
   will show missing glyphs.
9. **How it is written.** The command compiles with `nb-export` and writes with
   `ProjectRoot::write_atomic` to exactly `_notebook/exports/pdf/project.pdf`,
   replacing an earlier one. If the document cannot be built nothing is written.
   Optional, locked and not part of Verify, as the other exports.
10. **The nightly job.** `export_fixture <folder>` is the example the workflow
    calls. It reads `pdf-input.json`, `notebook.json` and `bibliography.json`
    from the folder and writes `project.pdf` beside them. Because Rust must not
    parse the fixture, the workflow first runs `scripts/build-pdf-input.mjs`,
    which uses `packages/format` and `packages/citations` to build those three
    files from `fixtures/projects/format-v1/typical` (read only), then runs
    veraPDF with `--flavour 3b` and checks that both file names are present in
    the PDF.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Pass Typst markup built from Markdown | User text would be formatted into source: ADR-0007's injection risk. |
| Typst's own `bibliography()` over CSL-JSON | Typst reads Hayagriva or BibTeX, not CSL-JSON, and would format citations a second time, apart from the engine the application uses. |
| Concatenate the experiments' Literature blocks | Several contexts, each numbered from 1 and repeating sources: not a project bibliography. |
| Let the example read the fixture | Needs notebook text parsed in Rust, against rule 2. |
| Embed figures now | PDF figures cannot be embedded under PDF/A (ADR-0015); each needs conversion. |

## Consequences

- **Dependency graph.** The desktop crate now depends on `nb-export`, so Typst
  and its dependencies are in the application and not only in a workspace
  member. `cargo deny check advisories` now reports six advisories on that
  graph (it passes on `main`): two vulnerabilities in `quick-xml` 0.38.4
  (RUSTSEC-2026-0194, RUSTSEC-2026-0195, fixed in 0.41 but pinned by
  `citationberg`, itself pulled in by Typst's `hayagriva`) and four
  unmaintained crates (`bincode`, `rustybuzz`, `ttf-parser`, `yaml-rust`). The
  template never calls Typst's `bibliography()`, so the application never gives
  Typst XML to parse, but `deny.toml` is protected and the decision to ignore
  them, or to keep Typst out of the application, is the maintainer's. See the
  PR description.
- **Tests.** `nb-export/tests/pdfa3.rs` (PDF/A-3b markers, both attachments with
  type and relationship, text reaches the page, hostile wording stays literal,
  deterministic bytes, the date comes from the input), `pdfBlocks.test.ts`,
  `pdfExport.test.ts`, `pdfExport.property.test.ts`,
  `pdfExport.golden.test.ts` with `__golden__/export-pdf-input.json` (S6-G02),
  `fixtures/pdf-input.fixtures.test.ts` (the script, on a copy of the typical
  fixture), `nb-archive/tests/pdf_export.rs`, the command test,
  `model/pdfExport.test.ts`, `model/projectBibliography.test.ts` and
  `PdfExportPanel.test.tsx`.
- **Validation.** The typical fixture's export and a richer sample (links,
  nested lists, code, quote, bibliography) were validated locally with veraPDF
  1.30 `--flavour 3b`: compliant, 146 rules passed, none failed (S6-G01). The
  nightly job repeats this on every run.
- **Protected paths.** `.github/workflows/nightly.yml`, `crates/nb-archive/` and
  this ADR.
- **Not tested.** The look of the PDF in a viewer; a very large project (the PDF
  grows with it); non-Latin scripts; the typical fixture has an empty
  `bibliography.json`, so the combined bibliography is covered by the unit tests
  and the richer sample, not by the nightly fixture; macOS.
