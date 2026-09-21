# ADR-0026: Questions and experiments

- Status: Proposed
- Date: 2026-09-21
- Deciders: maintainer
- Spec sections affected: 5.3, 5.4, 5.5, 6.5, 7.2 (FR-EXP-01 to FR-EXP-08); `docs/format/format-v1.md` section 5; gate S2-G02, S2-G03, S2-G06

## Context

S2-T10 creates, edits, moves and deletes questions and experiments. It is the first task that writes more than one notebook file for one action, and the first to use the commands ADR-0025 added. Four things the task depends on were open:

- Nothing lists the files in `questions/` and `experiments/`, so the webview cannot know which files to read.
- A create, move or delete changes several files. No write can be made atomic across files, so the order of writes has to be chosen so that a stop half-way leaves something `format-v1.md` section 5 already defines.
- Two rules of that section are silent on one case: an experiment whose file names one question while `project.yaml` lists it under another.
- ADR-0025 point 8 left `last_written_by` to "whatever saves `project.yaml`".

The points below were put to the maintainer with the plan; each was answered "go with the recommendations".

## Decision

1. **Slice.** Pure operations in `packages/format` (`notebook/`), a read-only listing in `nb-fs` and one command, a model in `features/notebook/model` that loads and carries out plans, a hook, and a plain list with forms. The table (S2-T11) and the section editors (S2-T12) replace the list and forms later. There is no index wiring: the model reads the files directly, and `nb-index` is left for the table, where the warm-open target (S2-G14) needs it.
2. **Operations return a plan, not a write.** Each of `createQuestion`, `createExperiment`, `editQuestion`, `editExperiment`, `moveExperiment`, `removeQuestion` and `removeExperiment` takes the parsed state and `{now, newId, appVersion}` and returns `Result<{steps, next}, NotebookError>`. A step is `create` (the file must not exist), `replace` (it must still be what was read) or `trash`. Nothing in `packages/format` does I/O or reads a clock.
3. **Order of writes.** The files a thing is made of come first and `project.yaml` last.

   | Action | Steps | If it stops after the first steps |
   | --- | --- | --- |
   | Create question | question file, `project.yaml` | Question exists but is not in `order`; it is shown after the listed ones. |
   | Create experiment | `experiment.md`, `artefacts.yaml`, `project.yaml` | Absent from `order`, so shown at the end of its question (FR-EXP-08). |
   | Move experiment | `experiment.md` (`question`), `project.yaml` | See point 4. |
   | Delete experiment or question | trash, `project.yaml` | `order` names a file that is gone: ignored, reported, dropped at the next write. |

   No step is undone when a later one fails. The model reads the disk again and shows what is there; the message says how many files were written.
4. **The file's `question` wins.** If `experiment.md` says question B and `order` lists it under A, it is shown under B, at the end (it is not in B's list), and the entry under A is reported (`orderMisplaced`) and dropped at the next `project.yaml` write. This interprets section 5 (which covers only an experiment absent from `order`) and changes no file format. **`format-v1.md` section 5 should gain a row saying so.** It is protected and is not edited here.
5. **Deleting a question moves only its file** to `.trash/`. Its experiments stay and are shown under Unassigned (FR-EXP-08), so nothing is lost with it. The question's entry, with its experiment order, is dropped from `project.yaml`, and it is removed from `table.collapsed_questions`. The view asks for confirmation and says how many experiments become unassigned.
6. **Refs are never reused.** A new number is the larger of the counter in `project.yaml` and one more than the highest number held by any question, experiment, file name, folder name, or file that could not be read. The counter is only raised. Deleted refs are covered by the counter. `.trash/` is not scanned, so a counter lowered by hand below a trashed ref could reissue it; the alternative is a listing command for the trash, which was not chosen. Refs are written with at least three digits (`EXP-1000` is valid).
7. **What a `project.yaml` write drops.** Entries naming a question with no file, and experiments listed under a question that is not their file's own, are dropped by every operation that writes `project.yaml`, as section 5 says. **Not while any file could not be read**: the entry may be that file's, and it would be lost. Such files stay unread, untouched, reported, and their names keep their refs (AGENTS.md rule 5).
8. **`last_written_by`.** Every operation that writes `project.yaml` sets it to the running version. An edit that would not write `project.yaml` writes it first if the versions differ, right after the version-change backup and before the edit, so the backup is not made again at every open. Nothing is written when an edit changes nothing.
9. **Files are never overwritten by mistake.** A `create` uses `Expected::Absent` and a `replace` uses the hash the file had when read, so an experiment folder that appeared, or a file edited elsewhere, stops the plan with `changed` and nothing of theirs is lost. The first write of a session goes through `createFirstWriteGuard`, and a project that is not writable (or whose lock was lost) writes nothing.
10. **Own writes and outside changes.** The notebook holds `project.yaml`, each question and each `experiment.md` in the watcher of ADR-0024. Before a write the hash of its text is marked as expected, so the echo of the write is not an outside change. The hash is computed in the webview by `shared/sha256.ts`, a 60-line SHA-256 checked against Node's, because `crypto.subtle` is asynchronous and exists only in a secure context, which the webview's origin on Windows may not be. A real outside change to a held file makes the notebook read everything again. A file created outside the application is not held, so it appears after Refresh or reopening.
11. **Duplicate IDs.** Of two files with one ID, the later one in file-name order is shown read-only (spec P6) and has no actions.
12. **The list command.** `list_notebook_files` returns the names in `questions/` and `experiments/`, sorted, skipping hidden names, non-`.md` files and links, and returns names only. It is `ProjectRoot::list_notebook` in `nb-fs`, a **protected path not named in the task**, added with the maintainer's approval. It reads the same set as the watcher and `nb-index`. It is in the S2-G06 scenario.
13. **Dependencies.** None.

## Not in this task

- **Offering to renumber** duplicate refs (FR-EXP-07 says "offer"; the task's definition says "detection"). It needs a folder rename in `nb-fs`, which has no rename operation. Duplicates are detected, reported and flagged where shown; IDs stay authoritative.
- Reordering (FR-TBL-08), the table (S2-T11), the section editors (S2-T12), the Motivation body of a question, and emptying or restoring the trash.
- Wiring `nb-index` to the parser.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Write `project.yaml` first, then the files | A stop leaves an order entry with no file. Section 5 covers that too, but it is worse for a person: the experiment vanishes from the list while its folder exists. |
| Undo the earlier steps when one fails | An undo is itself a write that can fail, and the person's files are then in two states they did not choose. Reading the disk and saying what is there is simpler and honest. |
| Trash the experiments with their question | More destructive, and spec 7.2 says "its files", which are the question's. |
| Let `order` win in a half-finished move | The file is what the person and other tools see when they open the folder. |
| Scan `.trash/` for refs | Needs a listing command for a folder the application otherwise never reads; the counter already covers every ref it issued. |
| Wire `nb-index` here | The task's definition does not need it, and S2-T11's performance target is what it is for. |
| `crypto.subtle` for the hash | Asynchronous, and possibly unavailable at the webview's origin. |
| Return the hash from `write_notebook_file` | Changes a command, `nb-fs` and the bindings for something the webview can compute. |
| A table row for each action in the UI | S2-T11's job. |

## Consequences

- **Spec 5.4, `format-v1.md` section 5 and AGENTS.md section 4 need a note** (protected or specification text, not edited here): point 4, and the new `nb-fs` read.
- **A half-finished action can be seen.** After a failed create the experiment is in the list, marked "Not in the saved order". The message says some files were saved.
- **No undo, no restore.** Deletions can be undone by moving files out of `.trash/` by hand.
- **Every operation reads the whole notebook again after a failure or an outside change.** For hundreds of experiments that is hundreds of reads; the table (S2-T11) and the index are where that is made fast.
- **An outside edit made between a read and a write** is caught by the compare in `write_data_file` for a `replace`, and by `Expected::Absent` for a `create`. The window of ADR-0025 (about a millisecond) remains.
- **Windows only.** Everything was run on Windows.
- **Not driven by hand.** The commands, the hook and the view were checked through the pure model, a fake project that answers like the commands, and static renderings, not in a running window. The generated bindings come from a debug launch.
- **Tests.** `packages/format/src/notebook/` (`refs`, `create`, `change`, `arrange`, `preserve-unknown.notebook` for S2-G03, and `project-model.property` for S2-G02, which includes a sequence property showing no ref is issued twice), `crates/nb-fs/tests/list_notebook.rs`, the scenario in `fs_safety.rs` (S2-G06) and the create-then-trash sequence in `tests/history/snapshot.rs`, and in the webview `features/notebook/` (`load`, `perform`, `held`, `messages`, `NotebookView`) and `shared/sha256`.
