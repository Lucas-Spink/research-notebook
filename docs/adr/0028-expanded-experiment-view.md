# ADR-0028: The expanded experiment view

- Status: Proposed
- Date: 2026-09-22
- Deciders: maintainer
- Spec sections affected: 7.3 (FR-TBL-07), 7.7 (FR-EDT-03); gate S2-G02, S2-G03

## Context

S2-T12 builds the expanded experiment view: editors for Methods, Results Notes and Interpretation, Results Notes and Interpretation side by side at 1280 px or more, and autosave with a Saved, Saving, Unsaved or Error status. Two things needed deciding before writing any code, and were put to the maintainer with the plan; both were answered "go with your recommendation".

- **Stage 4 has a task with almost the same words.** S4-T01, "Wire section editors to the format package", is *"Methods, Results Notes and Interpretation load and save through packages/format with one live editor at a time"*, gated by S4-G08, *"At most one editor instance mounted at any time"*. Read literally against this task's own wording — *"plain Markdown"* — the two tasks could mean the same editor built twice.
- ADR-0010's Tiptap spike (round-tripping artefact references and citations headlessly) was built for exactly this kind of editor, and `apps/desktop` has no Tiptap dependency yet.

## Decision

1. **This task builds plain text fields, not the rich editor.** "Plain Markdown" is read as literal Markdown text, close to a validated `<textarea>`, not the formatted, structured editing FR-EDT-01 (bold, italic, lists, headings, block quotes) and FR-EDT-02 (passthrough blocks for unsupported Markdown) describe. Those, and artefact references and citations, are Stage 4's job, built on ADR-0010's spike. **No new dependency.** `@tiptap/react` is not added to `apps/desktop`.
2. **"One live editor at a time" is read as one experiment's editors open at once**, already true because the table has a single selection (T11) — not that only one of the three section fields may be edited at a time, which would work against showing Results Notes and Interpretation side by side. S4-G08's literal "one editor instance mounted" is read as a Stage 4 concern once the editors are heavier (Tiptap/ProseMirror instances); it is not enforced here.
3. **Format layer.** `editExperimentSection(state, id, key, text, env)` in `packages/format/src/notebook`, alongside S2-T10's `editExperiment`. It uses the existing `setExperimentSection` (format-v1.md 4.3: refuses text that would leave a level-2 heading, an unclosed fence, or a literature marker in the section), bumps `updated`, stamps `last_written_by` when due, and returns a `Plan` like every other operation — no format or schema change. A refusal changes nothing and is reported with `field: "text"`, so the person's words are never lost to a save that would corrupt the file.
4. **Save path.** Reuses `perform()` unchanged (lock check, version-change backup, compare-before-write, marking the save so the watcher does not report its own echo). `useNotebook`'s `run()` now returns the whole outcome (`Performed`, widened to include a genuinely unexpected exception) instead of only `boolean`, so a per-editor autosave can tell *why* a save did not happen; the six existing callers (create, edit, move, delete) just check `.kind === "done"` as before. A new `silent` option on `run()` suppresses the shared notice banner for saves that already have their own status display — used here and nowhere else yet.
5. **Autosave.** `createAutosave` (pure, `expanded/model/autosave.ts`) debounces one second and flushes at once on blur (FR-EDT-03), the same shape as T11's `createSettingsCommitter` for one string value rather than a merge of fields. Unlike the settings committer, **a failed save keeps the local text** and reports `error` rather than reverting it: nobody should lose typed prose because of a stray outside edit or a moment of read-only. The next change or an explicit flush retries; nothing retries on its own. A React hook (`useAutosave`) is a thin, untested wrapper (all the logic is in the already-tested pure function, matching how `useExternalChanges` wraps `tracker.ts`); it starts a fresh autosave whenever the experiment or section changes, and makes a best-effort save of anything unsaved from the one before it disposes, so switching what is selected does not silently lose it.
6. **Where it lives.** Additive to the existing `DetailsPanel`: selecting an experiment shows its section editors below the title/status/dates/move/delete controls from S2-T10, not a separate page or modal. The section editors are disabled only when the project is not writable or the experiment is read-only (a duplicate ID) — deliberately **not** by the shared `busy` flag that disables the one-shot buttons elsewhere in the panel, so an unrelated action (creating a question) does not interrupt someone typing. Autosave itself never sets `busy`.
7. **Layout.** Results Notes and Interpretation share a `.expanded__pair` container, stacked in one column below 1280 px and side by side at that width or more, in CSS only (`@media (min-width: 1280px)`), the same precedent as the workspace table's responsive rules (ADR-0027): hand-tested, not asserted in a headless render.
8. **Dependencies.** None.

## Not in this task

- Rich formatting (FR-EDT-01), passthrough blocks (FR-EDT-02), artefact references and their autocomplete (FR-EDT-04 to 09), and citations (FR-CIT-*): Stage 4.
- S4-G08's literal editor-instance count.
- A dedicated `useNotebook.test.ts` or `useAutosave.test.ts`: consistent with how this hook has always been tested (through the pure model it wraps, and through the rendered components), neither exists; there is no `renderHook` utility in this repository.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Build the Tiptap rich editor now | Duplicates S4-T01's job, needs a new dependency the maintainer had not signed off on, and is a much larger task than this row describes. |
| Disable the other two editors while one has focus, to satisfy S4-G08's letter | Works against "side by side", which is meant to show both, and the gate itself belongs to Stage 4. |
| Drop the local text and show a generic error on a failed save, as the settings committer does | A person's typed prose is not a redoable layout tweak; losing it on a stray failure would be a real loss. |
| A `useNotebook.test.ts` using a hand-rolled hook harness | No `renderHook` utility exists in this repository; the pure logic it would exercise is already tested directly. |
| A separate write path for section saves, outside `run()`/`perform()` | Duplicates the lock check, backup guard and compare-before-write that every other write already gets through `perform()`. |

## Consequences

- **`run()`'s return type changed** from `Promise<boolean>` to `Promise<Performed | { kind: "unexpected" }>`. Every existing caller was updated to derive the boolean itself; behaviour is unchanged for them.
- **The status shown is per editor, not per experiment.** Three sections can be in three different states at once (one saved, one saving, one showing an error), which is deliberate: an error in Methods must not be reported as if it were about Interpretation.
- **A failed autosave is silent to the rest of the window.** It never raises the shared notice banner; only the one editor's own status says so. If the person never returns to that field, the error stays until they do.
- **Windows only.** Everything was run on Windows. The 1280 px breakpoint, focus behaviour while typing, and blur-triggered saves have not been seen in a running window.
- **Tests.** `packages/format/src/notebook/sections.test.ts`, and the S2-G02 sequence property extended with section edits; in the webview, `expanded/model/autosave.test.ts` (fake timers), `expanded/SectionEditor.test.tsx`, `expanded/ExpandedExperimentView.test.tsx`, `DetailsPanel.test.tsx` (the busy-vs-writable distinction), and the `messages.test.ts` additions for the new refusal and outcome text.
