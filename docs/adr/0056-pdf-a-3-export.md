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

## Advisories ignored in `deny.toml`

Checked 2026-10-10 against Typst 0.15.1 (the newest release) and the crate
sources in the lockfile. Each exception is by advisory ID, which cargo-deny
cannot narrow to one crate or one call, so the argument is that the code is not
reachable from untrusted input. Untrusted input here means a researcher's
notes, titles, artefact names, citation data and the files in the project.

What reaches Typst: only `/data.json` (the project as JSON text), the two JSON
files to attach, the fixed template and the embedded fonts. The `World` serves
nothing else (`world.rs`), the template is committed source, and project text
is only ever read as JSON strings, never evaluated. Researcher wording is
printed literally (`pdfa3.rs`, `injection.rs`).

| Advisory | Crate and path | Kind | Reachable from untrusted input? | Remove when |
| --- | --- | --- | --- | --- |
| RUSTSEC-2026-0194, RUSTSEC-2026-0195 | `quick-xml` 0.38.4 via `typst-library` > `hayagriva` > `citationberg` | Vulnerabilities (CPU and memory exhaustion on crafted XML) | No. The only caller in Typst is `CslStyle::from_data` (`bibliography.rs:546`), run for a CSL file given to `bibliography(style: ...)`. The template has no `bibliography`, no application code supplies a style, and nothing here serves XML. Built-in styles and locales are read from Typst's compiled archive, not parsed as XML. `plist`'s `quick-xml` 0.42 is outside the affected range. | `citationberg` is built on `quick-xml` 0.41 or later |
| RUSTSEC-2025-0141 | `bincode` 1.3.3 via `syntect` | Unmaintained | No. It decodes syntax sets compiled into the binary. | `syntect` or `two-face` no longer use `bincode` 1 |
| RUSTSEC-2024-0320 | `yaml-rust` 0.4.5 via `syntect` | Unmaintained | No. `SyntaxDefinition::load_from_str` (`raw.rs:732`) runs only for custom syntaxes passed to `raw(syntaxes: ...)`; the template passes none. Code blocks use `raw` with no language. | `syntect` moves to a maintained YAML parser |
| RUSTSEC-2026-0206 | `rustybuzz` 0.20.1 via `typst-layout`, `krilla` | Unmaintained | Shapes researcher text, but there is no known vulnerability. Fonts are the embedded ones. | Typst moves to `harfrust` or a maintained `rustybuzz` |
| RUSTSEC-2026-0192 | `ttf-parser` 0.25.1 via `fontdb`, `typst` | Unmaintained | Parses font files, and only the embedded fonts are ever loaded: no system or user fonts (`typst-kit` has `embedded-fonts` only). There is no known vulnerability. | Typst moves to a maintained font parser |

Latest releases on 2026-10-10: `typst` 0.15.1, `hayagriva` 0.10.1,
`citationberg` 0.7.0, `syntect` 5.3.0, `rustybuzz` 0.20.1, `ttf-parser` 0.25.1,
all already locked, so no upstream fix exists yet. `two-face` 0.5.2 is newer than
the 0.4.5 Typst pins; it does not remove a Typst dependency on its own.

Keeping the argument true:

- `crates/nb-export/tests/template_surface.rs` fails if the template starts to
  use `bibliography`, `cite`, custom syntaxes or themes, `xml`, `yaml`, `toml`,
  `csv`, `cbor`, `read`, `image`, `eval`, `plugin`, `#import`, `#include` or a
  package, or if fonts are ever searched for instead of the embedded ones.
- Giving Typst an XML, YAML or font file that is not embedded needs this
  section reopened, because it removes the reason the exceptions hold.
- cargo-deny reports `advisory-not-detected` when an ignored advisory stops
  applying, for instance after a Typst upgrade. The weekly workflow
  (`weekly.yml`, job `advisories`) fails on that warning, so a fixed exception
  cannot linger, and it writes the latest releases of these crates to the job
  summary, so the wait is visible. Removing an exception means deleting its entry
  in `deny.toml` and its row here.
- A new advisory on any of these crates, or any other crate, still fails CI.

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
  and its dependencies are in the application, and `cargo deny check advisories`
  reports six advisories on them. They are ignored in `deny.toml`, each with a
  reason, on the grounds set out under "Advisories ignored in `deny.toml`".
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
- **Protected paths.** `.github/workflows/nightly.yml`,
  `.github/workflows/weekly.yml`, `deny.toml`, `crates/nb-archive/` and this ADR.
- **Not tested.** The look of the PDF in a viewer; a very large project (the PDF
  grows with it); non-Latin scripts; the typical fixture has an empty
  `bibliography.json`, so the combined bibliography is covered by the unit tests
  and the richer sample, not by the nightly fixture; macOS.
