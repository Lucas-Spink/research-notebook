# ADR-0055: The machine-readable export is derived JSON, schemas and Markdown under exports/machine

- Status: Proposed
- Date: 2026-10-09
- Deciders: maintainer
- Spec sections affected: 7.12 (FR-ARC-07), 5.1, 8

## Context

S6-T07 exports "notebook.json with JSON Schemas and Markdown renderings of
every section" (FR-ARC-07, Must). The spec names `notebook.json` and gives it
no shape, and says nothing about where the files go. S6-T06 (the PDF/A export)
embeds `notebook.json` and reads it as the data for its Typst template, so its
shape becomes a contract other code relies on.

## Decision

1. **Not a format change.** The export is derived output under
   `_notebook/exports/machine/`, like the manifest (ADR-0051), git bundles
   (ADR-0053) and the HTML export (ADR-0054). No notebook file changes, and
   nothing here is read back by the application, so there is no format version
   increment or migration. `notebook.json` has its own `schemaVersion`, which
   starts at 1 and changes when its shape does.
2. **Built in `packages/format`.** `buildMachineExport` is pure: it takes the
   arranged project, `project.yaml`, the application version and a clock, and
   returns `{ name, text }` files. It reads no clock of its own, no file and no
   network, so the same project and clock give the same bytes. Rust never
   parses or builds notebook text.
3. **Files.**
   - `notebook.json`;
   - `schemas/<name>.schema.json`, the seven JSON Schemas of the notebook's
     data files and `notebook.schema.json`, so an archive carries the schemas
     beside the data they describe;
   - `markdown/<ref>.md`, one rendering per question and experiment.
4. **`notebook.json` is a faithful view of the parsed project.** It holds the
   project (id, name, locale, citation style, format version, archived), every
   question with its Motivation and experiment refs, and every experiment with
   its frontmatter, preamble, sections as written (recognised sections by a
   fixed English heading, unknown sections by their own), stored Literature
   block, the citekeys cited in Methods and Interpretation, and its artefacts
   with every version, hash, size and capture time, links and groups. Sources
   are not copied in: citekeys refer to `_notebook/bibliography.json`, which
   remains the single record of them. Keys are camelCase, because the file is
   for programs.
5. **Honest about what could not be read.** An experiment whose
   `artefacts.yaml` could not be read says `state: "unreadable"` and lists no
   artefacts, never an empty list that reads as none. A question or experiment
   that shares an ID or reference with an earlier one (spec P6) is left out and
   named in `notExported`, as in the HTML export, and the two exports select
   what to include with the same function.
6. **Markdown renderings.** Each rendering writes every section: facts,
   preamble, Methods, Results notes, Interpretation, unknown sections as
   written, Artefacts (results by group, then ungrouped, then methods files)
   and the stored Literature block. Artefact references keep their `art:`
   title and have their link target rewritten to the original file, relative
   to `markdown/`; one that cannot be resolved is left as written. Citations
   stay as the stored Pandoc citekeys; the export does not run the citation
   engine.
7. **Schema.** `NotebookJson` is a Zod schema in
   `packages/format/src/schema/notebookJson.ts`; `notebook.schema.json` is
   generated from it. It is deliberately **not** in `docs/format/schemas/`,
   which holds the schemas of the notebook's own files and is checked against
   `format-v1.md`: this is an export, not part of the on-disk format.
8. **How it is written.** Files are written with `ProjectRoot::write_atomic`,
   in the order built, so `notebook.json` is last and an interrupted run never
   leaves a new `notebook.json` naming files that are not there. Only three
   names are accepted: `notebook.json`, `schemas/<name>.schema.json` and
   `markdown/<name>.md`, where `<name>` is letters, digits, `-` and `_`.
   Anything else is refused.
9. **Failures are named.** The reply gives one outcome per file, by position.
   A reply that does not account for every file is a failure, not a shorter
   list. A file that could not be written is named and keeps its earlier
   content.
10. **Stale files.** A re-run replaces files of the same name. A rendering of
    an experiment deleted since stays, because the application never deletes;
    `notebook.json` lists only what the current export holds.
11. **Optional and locked.** Nothing is written unless the person asks, and the
    command needs the project lock, so a read-only project cannot export.
12. **Not part of Verify.** Exports are not captured files and are not in
    `manifest.csv`.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Put `notebook.schema.json` in `docs/format/schemas/` | That folder is the on-disk format's schemas and is tested against `format-v1.md`; an export schema there would read as a format change. |
| Copy full CSL-JSON for cited sources into `notebook.json` | Two copies of a source could disagree; `bibliography.json` stays the one record. |
| Build the files in Rust | Needs the notebook text parsed in Rust, against rule 2. |
| Render citations in the Markdown | Needs the citation engine and its worker; the stored citekeys stay readable by Pandoc, which the spec already promises. |
| One Markdown file per section type | Splits one experiment across many files and loses its order. |
| Define `notebook.json` inside S6-T06 | The PDF/A export would then own a contract other readers need; T07 defines it first and T06 reads it. |

## Consequences

- **No new dependency.** Zod and the schema export already exist in
  `packages/format`.
- **Tests.** `machineExport.test.ts`, `machineExport.property.test.ts`
  (valid against its own schema and stable for any title and note),
  `machineExport.golden.test.ts` with `__golden__/export-notebook.json`,
  `export-markdown-*.md` and `export-notebook.schema.json` (S6-G02, the
  `notebook.json` half), `nb-archive/tests/machine_export.rs` (allowed names,
  refusals, order, nothing outside `exports/machine/` changes), the command
  test, `model/machineExport.test.ts` and `MachineExportPanel.test.tsx`.
- **Protected paths.** `packages/format/src/schema/`, `crates/nb-archive/` and
  this ADR.
- **For S6-T06.** The PDF/A export reads `notebook.json`'s fields and embeds the
  file and `bibliography.json`; any change to the shape raises `schemaVersion`.
- **Wording.** The headings in the renderings reuse the HTML export's fixed
  British English wording, because the export outlives the application.
- **Not tested.** Opening the renderings in a Markdown viewer; a very large
  project (file size grows with the number of artefacts); a rewrite of an
  `art:` link inside a code block, which is changed like any other; Windows
  only.
