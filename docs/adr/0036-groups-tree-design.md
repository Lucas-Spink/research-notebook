# ADR-0036: Groups tree design

- Status: Proposed
- Date: 2026-09-23
- Deciders: maintainer
- Spec sections affected: 5.8 (`groups[]`, read only, no change), 7.5 (FR-GRP-01 to FR-GRP-06), 10.1 (NFR-PERF-04), 10.2; gates S3-G02, S3-G11, S3-G12

## Context

S3-T08 builds the Results groups tree. Groups can be created, renamed, nested and deleted. Move to and Add to are separate actions, available by drag, keyboard and menu. Manual ordering is kept, an Ungrouped area is shown, and large groups start collapsed. Spec 5.8 already fixes the file shape, and `ArtefactsFile` already enforces its constraints: an item names a result artefact in the same file, appears at most once per group, and the tree cannot contain cycles. The spec leaves these open:

- what "Move to" takes the artefact out of when the artefact is in several groups
- what happens to subgroups when a group is deleted
- whether expand and collapse state is saved
- how drag chooses between Move and Add
- how far this task goes, given that the desktop app does not yet load `artefacts.yaml` (ADR-0030 point 4 left `NotebookState` without it)

## Decision

1. **Operations are pure functions in `packages/format` over a parsed `ArtefactsFileModel`** (`notebook/groups.ts`): `createGroup`, `renameGroup`, `moveGroup` (nests and reorders), `deleteGroup`, `addToGroup`, `moveToGroup`, `removeFromGroup`, `reorderItem`, plus the derived `ungroupedArtefacts`. The shape matches `applyCapture` (ADR-0030). Each function changes `groups` only and carries `artefacts` over unchanged. Each validates its result through `ArtefactsFile` and returns a `NotebookError` refusal, not an invalid file. Names are trimmed. Positions are clamped, and a missing position means the end. `NotebookError`'s `notFound` gains the entity `group`.
2. **Move to takes the artefact out of the source group only.** Its other memberships stay. From the Ungrouped area it is the same as Add to. Within one group it is a reorder. When the artefact is already in the target group, the move is refused rather than merged (FR-GRP-03).
3. **Deleting a group deletes its subgroups.** Only memberships go. The confirmation states how many groups inside it and how many memberships are removed, and that no artefact or file is deleted. An artefact left without any membership shows under Ungrouped (FR-GRP-05).
4. **The Ungrouped area is derived, not stored.** It lists result-role artefacts that appear in no group, in capture order. Method artefacts never appear in the tree.
5. **Expand and collapse state lives in memory only.** A group or Ungrouped area with more than 50 items starts collapsed (FR-GRP-06). Nothing about the tree's view is written to the project, so there is no format change.
6. **Drag uses the native HTML5 events and needs no new dependency.** A plain drop moves. A drop with the copy key held (Ctrl, or Option on macOS, the platform copy modifiers) adds. Dropping an item on a group puts it at the end; dropping it on an item puts it just before that item. Dropping it on the Ungrouped area removes it from the group it came from. A group dropped on a group is nested at the end. Other groups are reordered with Alt+Up and Alt+Down or the menu.
7. **Keyboard access follows the ARIA treeview pattern** on a flat list: `aria-level`, `aria-posinset`, `aria-setsize`, a roving `tabindex`, and arrow, Home and End navigation. Enter, Shift+F10 or the context menu key open the row's actions, which hold every operation, including Move to and Add to as separate entries with group pickers. Alt+Up and Alt+Down reorder, F2 renames, and Delete removes a membership or asks before deleting a group. Pickers only offer groups the operation can use.
8. **Scope: the tree component and the operations, not yet mounted.** `features/results` exports `ResultsTree` (props: the parsed file, `disabled`, and an `onAction` callback that carries out a `GroupAction` and resolves to a refusal or success) and `applyGroupAction`. Loading and writing `artefacts.yaml` needs `NotebookState`, `loadNotebook`, the watcher's held files and `perform` to learn about the file. That is the same wiring ADR-0030, 0031, 0033 and 0035 left for a later task, and this task leaves it there too, which keeps the pull request reviewable.
9. **NFR-PERF-04 is checked by `results-tree.bench.tsx`** using Vitest 5's `bench` test fixture. It asserts a mean render under 200 ms for 2,000 artefacts in collapsed groups, and for a collapsed Ungrouped area of 2,000. It renders to markup in Node, which leaves out webview layout and paint.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Move to removes every other membership | Loses memberships the person did not act on. Add to exists for "also here"; Move to is "from here to there". |
| Deleting a group moves its subgroups up to its parent | A second, surprising effect of one action. The confirmation already says what goes, and nothing but memberships can be lost. |
| Save expand and collapse state in `project.yaml` or `artefacts.yaml` | A format change (AGENTS.md rule 3) for view state the spec does not ask to keep. |
| A drag-and-drop library | A new dependency (AGENTS.md section 7) when native events cover drag between rows. |
| Mount the tree and wire `artefacts.yaml` loading and writing in this task | Changes the notebook loader, the watcher and the write path, which is a separate concern and would roughly double the diff. |
| Add `axe-core` now for S3-G12 | A new dependency. The maintainer chose to defer it; see Consequences. |

## Consequences

- **S3-G02 passes**: `pnpm test:property -- groups` runs random operation sequences and checks four things: `artefacts` stays byte-identical, no group lists an item twice, what is written reads back unchanged, and untouched groups keep their order.
- **S3-G11 passes** in Node (mean about 1 ms on the development machine). Running it in the webview is still left to the end-to-end tooling.
- **S3-G12 is partly open.** The keyboard model is unit-tested and the rendered ARIA attributes are asserted. There is no automated axe check (no `axe-core`) and no manual screen reader pass yet, because the tree is not mounted.
- Nobody can use the tree in the app until a wiring task mounts it (for example in the expanded experiment view or the Results cell, FR-TBL-06) and supplies `onAction` through `perform`. That task also turns write failures into messages, since `ActionOutcome` currently carries only format refusals.
- `pnpm bench` runs each benchmark once per Vitest project (five times), because the projects don't restrict `benchmark.include`. That is harmless but slow, and a tooling task can tidy it.
