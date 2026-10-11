# ADR-0062: Removing files, and the Bin

- Status: Proposed
- Date: 2026-10-11
- Deciders: maintainer
- Spec sections affected: 5.11 (`.trash/`), 7.5, FR-EXP-06, FR-EVD-10; builds on ADR-0025 and ADR-0044. No change to chapter 5.

## Context

A question or experiment could be deleted, and went to `_notebook/.trash/<timestamp>/<original path>` (ADR-0025), but:

- the only route to it was to select a row, open the ribbon's "More actions" menu and choose Delete, which nothing on the row hinted at;
- there was no way to remove a figure or a script from an experiment at all;
- nothing in the application could bring anything back from `.trash/`.

The maintainer asked for removal of files and of questions and experiments to move things to a bin, restorable later, left out of every export and kept in the archive. Clearing the bin is up to the person.

## Decision

1. **`.trash/` is the bin.** It keeps its name and layout, so there is no on-disk format change, no format version, no migration and no new fixture. The Bin is a view of it.
2. **Move to bin is on the row.** Each question and experiment row in the workspace table has a visible "Move to bin" button that asks first and says the item can be restored. It calls the same actions as the ribbon, which stays. The button is absent for a read-only project or item. The user-facing word "Delete" becomes "Move to bin" where it moves to `.trash/`.
3. **Removing a file.** A copied artefact's version files move to `.trash/<stamp>/experiments/<experiment>/…`, in one stamp folder, beside a record of the artefact. The record is an ordinary `artefacts.yaml` that holds only that artefact, made by `packages/format` and written by `nb-fs` as the first step. Then the artefact leaves the experiment's `artefacts.yaml` and every group. A linked artefact has no copy: only its record goes to the bin, and **the original file is never touched**.
4. **Order.** Bin the files, then change `artefacts.yaml`. If the second step fails, the files are in the bin and the record is still listed, so the integrity check reports them and Restore puts them right. No order leaves a record with neither a file nor a copy.
5. **The warning counts references.** Before removing a file the confirmation says how many places in the notebook refer to it, using the existing reference index. Those references show as missing until it is restored. Removal is not blocked.
6. **Restore never overwrites.** `nb-fs` checks every destination first and refuses, moving nothing, if any is taken (`ProjectError::NameTaken`). A question or experiment is renamed back and the notebook reloaded. Removed files go back to their folders, and then their record is added to `artefacts.yaml` again, in no group. The record in the bin is renamed `artefacts.restored.yaml` so the bin no longer lists it; it stays in the bin.
7. **Nothing in the application empties the bin.** There is no Empty command and no delete anywhere in these paths. The Bin says that the person clears it by closing the application and deleting `.trash` by hand.
8. **Exports and archives.** HTML, PDF and machine-readable exports are built from the live notebook, whose listing never walks `.trash/`, so they leave the bin out (`list_notebook` already tested this). Archives and bundles list every file in `_notebook/` and so keep it (new test).
9. **Commands.** `bin_artefact_files`, `list_bin`, `read_binned_record` and `restore_from_bin`, taking validated newtypes (`ExperimentFolder`, `BinSegment`, `VersionPath`), never raw paths. The two that write need the project lock. Reading a record is bounded to 2 MiB.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Rename `.trash` to `bin` | A format change under rule 3: version, migration, fixtures and approval, for a name. |
| Restore by hand only | The user asked for retrieval later; moving files and re-editing `artefacts.yaml` by hand is error-prone. |
| Block removal while a file is referenced | Safer but awkward; the references are only text and restoring fixes them. |
| Drop the record and leave the files in `evidence/` | Leaves orphan files that the integrity check flags and a record that cannot be restored. |
| Keep the whole `artefacts.yaml` in the bin | Does not say which artefact was removed, and a linked one has no file to tell it by. |
| Keep group membership in the bin | A group may be gone or renamed by the time of restore; the file returns ungrouped. |
| An Empty bin command | A destructive command the maintainer asked to leave to the person. |

## Consequences

- **Restoring an artefact is two steps** (files, then record). If the second fails the files are back but unlisted; the message says so.
- **A restored file loses its group.** It returns ungrouped.
- **`ProjectError` gains `nameTaken`**, and `WriteError` gains `Exists`.
- **`nb-fs` is a protected path.** `bin.rs` is new, and `trash.rs` now shares its move step (`trash_into`) and takes several relative paths when choosing a stamp folder, so an artefact's files and record share one folder.
- **Tests:**
  - `packages/format/src/notebook/artefact-bin.test.ts` (with a property test).
  - `crates/nb-fs/tests/history/bin.rs`, plus additions to `fs_safety.rs` and `export.rs`.
  - Command validation tests in `commands/projects/bin.rs`.
  - `table/model/binArtefact.test.ts`, `move-to-bin.test.tsx`, `ResultsTree.remove.test.tsx`, `results-cell.test.tsx`, `features/bin/*` and `workspace/model/restoreEntry.test.ts`.
- **Not tested:**
  - The interface in a running window.
  - macOS.
  - Restoring from a bin on a different drive from the project, which cannot happen because the bin lives inside `_notebook/`.
- **Documents:** spec 5.11 and FR-EXP-06 / FR-EVD-10 should gain Restore and "Remove file" when the spec is next revised. They are not edited here.
