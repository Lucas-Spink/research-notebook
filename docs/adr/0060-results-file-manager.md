# ADR-0060: Results file manager additions

- Status: Proposed
- Date: 2026-10-10
- Deciders: maintainer
- Spec sections affected: 7.5 (FR-GRP-01 to FR-GRP-06); issue #101 (section 5); builds on ADR-0036 and ADR-0044. No change to chapter 5.

## Context

ADR-0036 and ADR-0044 built and mounted the Results groups tree: folders, nesting, drag-and-drop, Move to, context menus and keyboard access. Issue #101 asks for what a file manager adds on top: choosing several items, Expand all and Collapse all, renaming a result's display name, opening the file, and a way to delete a folder without losing what is in it. None of these needs a format change.

## Decision

1. **A selection is view state.** Chosen rows live in memory in `useResultsTree` and are never saved (ADR-0036 point 5). Ctrl or Command-click toggles, Shift-click and Shift-arrow extend, Space toggles, a plain click chooses one, and clicking a folder clears the choice.
2. **Moving several is one `batch` action.** `applyGroupAction` applies the steps in order to the same file; if any is refused none is kept, and the caller saves once, so a batch is one write and cannot half-apply. Items that would be refused (already in the target group, or not in a group to leave) are left out when the batch is built, so a mixed selection moves what can move. Several items can be dropped on a group or on Ungrouped; a place among siblings is for one item.
3. **`dissolveGroup` is a second way to delete a folder.** Its subgroups take its place among its siblings in order, and its artefacts join its parent group (not twice), or become ungrouped at the top level. `deleteGroup` keeps ADR-0036 point 3. The confirmation offers both and says what each does.
4. **`renameArtefact` changes `name` only.** It trims, validates through `ArtefactsFile`, and never touches `source`, versions, groups or the file on disk. The menu says the file is not renamed.
5. **Open and Show in file explorer use the existing commands** `open_captured_file_action` and `open_linked_file_action`. A copied result opens its latest captured copy under `_notebook/`; a linked result opens the file where it lives. They launch and never write.
6. **Expand all and Collapse all** are in-memory expansion changes, for the whole tree or one folder's subtree.

## Not done, and why

- **"Remove from Strata"** (deleting a result's record) is not offered. Captured versions are immutable (ADR-0003), and removing a record would orphan its files in `evidence/` with no way back. Removing a result from a folder is offered.
- **Unique folder names** among siblings are not enforced: the issue allows duplicates, and a rename that collides is not a data risk.
- **Previews inside the tree** are not added; double-click already opens the preview pane.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Save the selection or expansion in the project | A format change for view state (ADR-0036 point 5). |
| One write per moved item | A failure part-way would leave a half-moved selection. |
| Make `deleteGroup` keep contents | Changes an accepted decision; both behaviours are useful and the person chooses. |
