# ADR-0027: The workspace table

- Status: Proposed
- Date: 2026-09-21
- Deciders: maintainer
- Spec sections affected: 4.3, 7.3 (FR-TBL-01 to FR-TBL-05, FR-TBL-10), 10.2; gates S2-G02, S2-G03, S2-G14

## Context

S2-T11 replaces the plain list of S2-T10 with the workspace table: a header row per question, ordering from `project.yaml`, sort and filter within questions, column settings kept in `project.yaml`, and virtualised rows. ADR-0005 and ADR-0016 already chose TanStack Table and TanStack Virtual, with question headers drawn by the application and read-only cells. Four things were open:

- FR-TBL-05 asks for line-clamped summaries "from Markdown", but only `packages/format` may parse Markdown (AGENTS.md rule 2).
- Spec 4.3 says Results and the artefact half of Methods come from `artefacts.yaml`, which nothing captures until Stage 3.
- A read-only cell cannot edit, so create, edit, move and delete need somewhere to live until the expanded view (S2-T12).
- Every save of `project.yaml` keeps a snapshot (ADR-0025), and a column drag or a run of collapses would make many.

The points below were put to the maintainer with the plan; each was answered "go with the recommendations".

## Decision

1. **Slice.** Pure operations in `packages/format` (`summariseMarkdown`, `changeTableSettings`, `resetTableColumns`); a pure model in `features/notebook/table/model` (rows, sort, filter, column layout, a coalescing committer); the table, toolbar and column menu; the hook saves layout through the existing write path. No Rust, no command, no format change: `table.columns` and `table.collapsed_questions` are already in the schema.
2. **One flat list of rows.** `buildRows` returns each question's header row followed by its experiments, then Unassigned, so the virtualiser has a single array. TanStack Table holds the column model (order, visibility, size, taken from `project.yaml`); it is given no data rows, because a question header is not a data row (ADR-0005). TanStack Virtual holds the window of rows.
3. **Sort and filter are per question.** They are pure functions run inside each question, so an experiment never leaves its question and each header's count is its own, shown as "n of m" while a filter is in force. TanStack's own sorting would sort across question boundaries. Sort is by ref (as a number), title, status (planned, running, complete, abandoned), started or completed; a missing date is always last; equal values keep their order; clearing returns to the order in `project.yaml`. The filter is text (ref, title, status and the whole of every section, not its summary) and status. Neither is saved: the specification stores only widths, hidden columns and collapsed questions, and they are what the person is looking at, not project data. Sort is a control in the toolbar, not a button in each column heading, so it is an ordinary labelled form control.
4. **Cells are summaries, made in `packages/format`.** `summariseMarkdown` turns a section into one plain line of at most 240 characters (1,000 at most): block markers, emphasis, links, images, raw HTML, code fences and table pipes go, and a link or an artefact reference shows its label. Citations are left as written (`[@z:u:7XK2PQ9M]`) until Stage 5 renders them, because hiding them would hide content. It reads only the start of a long text, in linear time, so a hostile section cannot stall the table. CSS clamps the line count. Summaries are made once per experiment file and reused until the file is replaced.
5. **Results and Methods.** Methods shows the `## Methods` text only, and Results shows "None yet", without reading `artefacts.yaml` (about 500 more reads for numbers that are always 0 until capture exists). FR-TBL-06 (group counts, thumbnails, Browse all) and method-role artefacts belong to Stage 3. The "missing evidence" and "newer references" filters of FR-TBL-09 (*Should*) wait for the same reason.
6. **Motivation.** Spec 4.3 says it is "shown once per question header row", yet `table.columns` lists it as a column. It is a column in the settings (it can be hidden and given a width) but has no cell in an experiment row: while shown, its summary appears in each question header, limited to that width.
7. **Saving the layout.** All changes go through one committer. A resize by keyboard or a hide or collapse is saved after a 1 s wait, with any others, as one write of `project.yaml` (`changeTableSettings`); a drag shows its width live and is saved once when it ends; the columns menu saves a typed width when the field is left. Saves never overlap, and go through `perform` like every other change: the lock, the version-change backup, compare-before-write, and marking the save so the watcher does not report it. What is not yet saved is shown at once, and dropped if the save fails, so the table shows what is on disk. Dropping the committer (project closed) drops what is waiting, so nothing is saved to another project. Reset discards anything waiting first, or it would be undone.
8. **Read-only projects.** Hide, resize and collapse work for the session and are never saved, with a note in the columns menu (P6). The Unassigned group has no ID to store, so its collapse is always for the session.
9. **Editing.** Selecting a row or a question header opens a details panel under the table with the forms of S2-T10 (edit, move, delete; rename, delete and add experiment for a question), and "New question" stays below. S2-T12's expanded view takes editing over. `QuestionSection` became `QuestionTools`; the view tests of the plain list were replaced by tests of the table.
10. **Width limits.** The table keeps a column between 80 and 1,200 pixels, whatever `project.yaml` says; the format sets no bound (format-v1.md 4.1) and is not changed.
11. **Virtualising.** Rows are a fixed height (a question header 64 px, an experiment 112 px, four clamped lines), so scrolling never measures anything. Only the rows in the window, plus 8 either side, are mounted; `aria-rowcount` and `aria-rowindex` still say how big the table is.
12. **Keyboard and accessibility (spec 10.2).** The scroll area takes focus, so the arrow keys and Page Up and Down scroll it; that is also how a row not yet mounted is reached. Column edges are focusable separators with their value exposed, moved by the arrow keys (10 px, 50 with Shift) and Home and End. Every control is an ordinary button, field or select with a label; status is shown in words; focus is visible.
13. **The spike.** `TableSpike` is no longer mounted in `App.tsx`. Its files and tests stay until they are cleaned up.
14. **Dependencies.** None. `@tanstack/react-table` 9.2.4 and `@tanstack/react-virtual` 3.14.13 were already pinned.

## Measurements

A generated project of 500 experiments in 20 questions, 2 KB each, run in Node on Windows with an in-memory stand-in for the commands, so **not including the cost of about 520 real command calls**:

| Step | Time |
| --- | --- |
| Load (list, read and parse everything) | 123 ms |
| Arrange | 2.6 ms |
| Build the rows, first time (makes the summaries) | 29 ms |
| Build the rows again, with a sort or a filter | about 1 ms |
| Render the window (static markup) | 23 ms |

These are not the numbers of NFR-PERF-01 (interactive in under 2 s with a warm index) or NFR-PERF-03 (no frame over 50 ms while scrolling), which need the real webview, the large fixture (S2-T13) and a benchmark.

## Not in this task

- The `open-large` benchmark (S2-G14), the large fixture, and wiring `nb-index` to the parser. **S2-G14 stays open.** The model reads every file directly, as in S2-T10.
- Reordering questions and experiments (FR-TBL-08, *Should*).
- Results cells (FR-TBL-06), the filters that need artefacts, and method-role artefacts (Stage 3).
- Rendering citations in cells (Stage 5).
- Dragging a column to reorder it: the order in `project.yaml` is honoured, but the interface only resizes and hides.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| TanStack Table's sorting and filtering | They act on the whole data set, so sorting would cross question boundaries. |
| Sort by clicking a column heading | More to make accessible (sort state, `aria-sort`, keyboard) for the same result as a labelled select. |
| Summarise Markdown in the webview | A second Markdown parser, against rule 2 and ADR-0002. |
| Read `artefacts.yaml` for result counts | About 500 more reads for a number that is always 0 until Stage 3. |
| Save every width change at once | One snapshot per pixel of a drag. |
| Save layout changes made in a read-only project | Writes to a project this window may not write to (P6). |
| Variable-height rows, measured | Measuring while scrolling is what makes long tables janky; a clamped summary needs no measuring. |
| Put editing in the row (a cell editor) | ADR-0005: the table contains no live editors. |
| Wire `nb-index` now | The task's definition does not need it, and it means new commands and a record mapping. |

## Consequences

- **A row that is not mounted cannot be tabbed to.** Scrolling with the keyboard mounts it; the filter also narrows a long table. A "go to experiment" control would be better and is not built.
- **Every layout save keeps a snapshot** of `project.yaml`. Coalescing keeps that to one per burst, but collapsing a question, waiting a second, and collapsing another is two.
- **A layout change made while `project.yaml` was edited outside is dropped**, with no message: the compare before write refuses it and the table shows what is on disk.
- **The table reads everything again after a failure or an outside change** (ADR-0026). At 500 experiments that is 520 reads; the index is where that would be made cheap.
- **Windows only.** Everything was run on Windows. The table has not been driven in a real window: pointer dragging of a column edge and scrolling are untested, and the CSS (sticky headings, line clamp, focus outlines) has not been seen.
- **Tests.** In `packages/format/src/notebook/`: `summary` (with a property test), `table-settings`, and the sequence property (S2-G02) now including layout changes. In `features/notebook/table/`: `model/columns`, `model/rows`, `model/settingsCommit`, `model/settingsFlow` (saving end to end through `perform`), `TableParts`, and `NotebookView` (roles, counts, windowing of 500 experiments, controls).
