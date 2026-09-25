# ADR-0041: Project search stays in-memory, not `nb-index`

- Status: Proposed
- Date: 2026-09-25
- Deciders: maintainer
- Spec sections affected: 6.6, 7.9 (FR-SRC-01, FR-SRC-02); gate S4-G06

## Context

S4-T08 implements search: titles, section text, artefact display names and
filenames, grouped by question or experiment with a snippet, opening at the
matching location. Spec 6.6 names the index's own technology as "SQLite with
FTS5 via rusqlite", and `nb-index` (S2-T07, ADR-0023) already has a complete,
tested `fts` table and `Index::search` matching this task almost field for
field (`FtsKind::Title`, `Section`, `Name`, `Filename`).

But `nb-index` is never wired into the running application. ADR-0026 point 1
and ADR-0027's alternatives table both record the same decision, twice: "the
model reads the files directly, and `nb-index` is left for [when its warm-open
target needs it]". Nothing since S2-T07 has called `Index::open`, `Index::scan`
or `Index::apply`; S2-G14 (large project opens quickly with a warm index) is
still open. Wiring it now, for search specifically, means adding a Tauri
command that receives rows parsed by `packages/format` in the webview over
IPC (the only way to keep AGENTS.md rule 2: `nb-index` itself never parses,
by design, per ADR-0023 point 1), a JSON mapping for all ten row kinds, and
a way to keep it in step with every save — a change far larger than this
task's own slice, touching a protected path (`nb-fs`'s cache module) that is
not named in the task.

There is also a harness reason. This project's own `pnpm bench` convention
(`results-tree.bench.tsx`, S3-T11) measures a pure function in Vitest,
entirely in Node, with no Tauri process and no IPC round trip. S4-G06 says
`pnpm bench -- search`. A search that only works by calling a Rust command
could not be benchmarked that way at all.

## Decision

Search is implemented entirely in TypeScript, over data the application
already holds or can cheaply fetch, with no Rust or IPC involvement beyond
the existing `read_notebook_file` command:

1. `features/notebook/search/model/searchIndex.ts` builds a flat, pre-tokenised
   list from the already-loaded `Arranged` tree (questions, experiments,
   recognised sections) plus whatever `artefacts.yaml` files have been read.
   `searchNotebook` filters it by query (case-insensitive, each word a
   prefix match, all required) and groups hits by question or experiment.
2. `features/notebook/search/model/useAllArtefacts.ts` reads every listed
   experiment's `artefacts.yaml` once, only when the search panel is first
   opened, the same batched pattern `model/load.ts` already uses for the
   project's questions and experiments.
3. Snippets reuse `summariseMarkdown` (the same Markdown-to-plain-text
   conversion the table's cells already use, FR-TBL-05) around the raw-text
   match position, so a long section shows where the match is, not only its
   start.
4. `nb-index` is untouched. This continues, rather than reopens, the decision
   ADR-0026 and ADR-0027 already made twice.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Wire `nb-index`: an IPC command that receives rows parsed in the webview, called on open and after every save | Needs a new command, a row-mapping surface for every `FileRecords` kind, and a way to keep the index in step with saves — a second task's worth of work the stage sheet does not list separately, and untestable by `pnpm bench` as this repository uses it (see Context). |
| Wire `nb-index` for a one-shot rebuild only, searched through it | Same IPC/mapping cost as full wiring, for no incremental benefit over rebuilding an in-memory list, and still not benchmarkable the way S4-G06 asks. |
| Parse every file's text through a Rust command and search there | Breaks AGENTS.md rule 2: only `packages/format` parses. |
| Fetch every artefact file eagerly whenever the project loads, not only when search opens | Slows every project open for a cost only search needs; `useAllArtefacts` fetches once, lazily, the first time the panel is opened instead. |

## Consequences

- **S2-G14 stays open.** This task does nothing to move it; a table view
  reading hundreds of files on every open (ADR-0026, ADR-0027) is still the
  gap `nb-index` was built for.
- **A future task that wires `nb-index`** (for S2-G14, or for S4-T09's
  "Referenced in" lookup, which the `refs` table already anticipates) does
  not need to touch search: it is free to stay as it is, or be rebuilt on
  top of the index later, without a format or behaviour change.
- **Search sees only what is loaded.** Artefact names and filenames are
  absent from a result until the panel has been opened at least once in the
  session (`useAllArtefacts`'s one-shot read); titles and section text are
  always current, since `model/load.ts` already reads every question and
  experiment file up front.
- **Tests.** `features/notebook/search/model/searchIndex.test.ts` (matching
  rules, every field kind, grouping), `searchIndex.bench.ts` (S4-G06,
  ~30 ms to build and ~2–5 ms to search a 500-experiment, 5,000-artefact
  project on the reference machine used here), `SearchPanel.test.tsx`, and
  the navigation added to `ExpandedExperimentView.test.tsx`.
- **Windows only.** Everything here was run on Windows.
