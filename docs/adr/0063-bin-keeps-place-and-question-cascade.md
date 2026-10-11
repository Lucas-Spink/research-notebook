# ADR-0063: The bin keeps a place, and binning a question bins its experiments

- Status: Proposed
- Date: 2026-10-11
- Deciders: maintainer
- Spec sections affected: 5.11 (`.trash/`), FR-EXP-06, FR-EXP-08; supersedes ADR-0026 point 5; amends ADR-0062 point 1 (what the bin holds). No change to chapter 5's notebook files.

## Context

Two things were wrong with the bin once ADR-0062 let people restore from it:

- **Restore lost the place.** Deleting a question dropped its entry from `project.yaml`'s `order`, and nothing recorded where it had been. A restored question was appended, so restoring Q2 of three put it after Q3. The same held for an experiment under its question, and for the order of a question's experiments.
- **A question left its experiments behind.** ADR-0026 point 5 moved only the question file; its experiments stayed, shown as Unassigned. The maintainer asked for the opposite: moving a question to the bin moves its experiments too, and restoring the question restores them.

## Decision

1. **Binning a question bins its experiments.** `removeQuestion` plans a `trash` step for the folder of every experiment whose file names the question, in the order shown, then one for the question file, then writes `project.yaml` without them. Experiments go first, so an interrupted plan never leaves experiments orphaned under a question that is gone. This supersedes ADR-0026 point 5. The confirmation names the number of experiments, and an experiment moved to the bin on its own is unchanged.
2. **A note is kept beside what is binned.** `move_to_trash` takes an optional text, which `nb-fs` writes to `_notebook/.trash/<stamp>/notes/<questions|experiments>/<name>.json` (at most 16 KiB). `list_bin` returns it as `note` on the entry, as text. Nothing in Rust reads it.
3. **What the note says** (`packages/format/src/notebook/bin-note.ts`, the only code that reads or writes it): a version (1), an `index`, and a list of experiment folders. For a question, `index` is its position among the questions as shown (listed or not), and the list is its experiments in the order shown. For an experiment, `index` is its position under its question.
4. **Restore uses it.** `adoptIntoOrder` inserts a question at `index` among the questions as shown, with its experiments in the noted order, and an experiment at its `index`. An index past the end means the end. Restoring a question also restores the most recent bin entry of each experiment folder in its note; one that cannot come back stays in the bin, and the person is told.
5. **A missing or unreadable note costs only the place.** It is not an error. The item returns at the end, as before ADR-0063.
6. **No format change.** The note lives in `.trash/`, which `packages/format` never parses for notebook data (format-v1.md section on `.trash/`) and which the application treats as its own state. No notebook file changes, so there is no format version, migration or fixture. `.trash/` was already free-form for the application (ADR-0062 point 1); this adds one app-written file type to it, and **the maintainer approved the sidecar**.
7. **Exports and archives** are unaffected: exports never walk `.trash/`; archives keep everything in `_notebook/`, notes included.
8. **Not done.** The Bin lists a question and its experiments as separate entries; grouping them in the list is left for later. Restoring an experiment alone while its question is still in the bin leaves it Unassigned, as before.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Remember positions in memory only | Lost when the application closes, so a restore after a restart goes back to the bottom. |
| Store the old order in `project.yaml` | A format change (version, migration, fixtures) for application state. |
| Leave experiments behind, as ADR-0026 point 5 said | Opposite of what the maintainer asked for. |
| Make `list_bin` group a question with its experiments in `nb-fs` | Needs `nb-fs` to know which experiment belongs to which question, which means parsing notebook files outside `packages/format` (AGENTS.md rule 2). The note names the folders instead. |
| Extend `write_notebook_file` to `.trash/` | That command accepts only notebook data paths; widening it would let the webview write anywhere in the bin. |
