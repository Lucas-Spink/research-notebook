# ADR-0064: Project canvases, a second view over the notebook (format version 2)

- Status: Accepted
- Date: 2026-10-11
- Deciders: maintainer
- Spec sections affected: 5.1 (folder layout), 5.13 (versioning), new 5.14 (canvas files), 6.3, 7.3 (workspace views), 7.5 (virtual groups, drag payloads), 7.7 (editors); ADR-0043 (single live editor, new surface). Changes chapter 5: **format version 1 becomes 2**.

## Context

Issue #117 asks for a spatial workspace where plots from several experiments sit side by side while the person writes up the experiment text. The table makes this awkward: previews open and close one at a time, so figures cannot be compared while an interpretation is written.

The canvas must be another view of the same research record, not a second place to keep notes. Its layout (which result sits where, how big, the viewport, notes and connectors) is presentation data that has to survive restarts, backups, archives and history, so it must live in `_notebook/` as plain files (AGENTS.md section 1). The maintainer decided:

- Canvases are **project-wide**: one canvas can pin results from experiments under any question.
- A project can have **several named canvases**.
- Only Methods, Results Notes and Interpretation are edited in the canvas.

## Decision

1. **A new file kind.** Each canvas is `_notebook/canvases/<CANVAS_ULID>.canvas.json`, canonical JSON as in format-v1.md 3.5. The name is in the file (`name`), not the filename, so renaming moves nothing.
2. **Contents.** `format_version`, `id`, `name`, `nodes`, `edges`, `viewport {x, y, zoom}`. Node types are `artefact` (`experiment_id`, `artefact_id`, `version`, position, size), `note` (`text`, position, size) and `region` (`label`, position, size). Edges have `source`, `target` and an optional `label` from a fixed set (supports, contradicts, derived-from, related-to, requires-investigation). All identifiers are ULIDs. Unknown keys are preserved, as for other loose objects.
3. **References, never copies.** A node names an experiment and an artefact by ULID and pins one version number. No Methods, Results Notes or Interpretation text, and no evidence bytes, appear in a canvas file. A dangling reference (binned experiment, removed artefact) is shown as missing and is never deleted or rewritten by the application. Pinned versions never advance automatically; the person updates a card explicitly.
4. **Format version 2.** Adding a file kind is a chapter 5 change (spec 5.13; the ADR-0059 exception covers only optional keys). `FORMAT_VERSION` becomes 2, `MIGRATIONS` gains a pure v1 to v2 step that changes only `format_version` in existing files (a v1 project has no canvases), the app takes the existing version-change backup and asks first, and applications that only know version 1 open a version 2 project read-only (format-v1.md section 6). Released v1 fixtures stay immutable; new `format-v2` fixtures are added, including a canvas that pins results across questions.
5. **One implementation.** `packages/format` owns the canvas schema (Zod and generated JSON Schema), parse and serialise, and the cross-file checks. Nothing else parses canvas files.
6. **Application plumbing.** `nb-fs`'s notebook data path rule accepts `canvases/<name>.canvas.json`, so the existing read and write commands, history snapshots, version-change backups, watcher, conflict detection and nb-index apply without new commands. Deleting a canvas moves it to the bin (`.trash/`), which needs a canvas trash target. Bundles and archives include the folder; machine export and verification are checked and extended deliberately.
7. **A file that fails its schema** is left untouched and that canvas opens read-only (AGENTS.md rule 5). No other canvas and no table data is affected.
8. **The canvas is a view.** The writing panel uses the table's section editor on the same experiment records and takes part in the single live editor (new `canvas` surface, ADR-0043). Question tabs sit above experiment tabs. The frontend uses `@xyflow/react` for pan, zoom, selection and connectors, subject to the section 7 dependency checklist; if it fails the checklist, work stops and this ADR is revisited.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| One canvas per question | Maintainer wants results from the whole project on one canvas. |
| Store layout in `project.yaml` | Mixes presentation with project settings, grows without bound, and merges badly. |
| Store layout only in the app cache | Not portable and not part of the research record (issue #117, section 11). |
| Optional-extension without a version bump | ADR-0059's exception covers optional keys, not new files; an older app could silently ignore data it should preserve. |
| Embed text copies in cards | Duplicates scientific content and breaks the single source of truth. |
| Custom pan, zoom and connectors, no dependency | More code to maintain and test, especially connectors and multi-select. Kept as the fallback if the dependency checklist fails. |

## Consequences

- Easier: comparing figures from several experiments while writing; layouts survive restarts, backups and history; the table is unchanged.
- Harder: format version 2 means older app versions open these projects read-only; one more file kind in the allow-lists of `nb-fs`, nb-index, history and archives.
- Must be tested: canvas round trip (property), v1 to v2 migration on a copy of the `typical` fixture, dangling references, malformed canvas stays untouched, removing a card leaves `artefacts.yaml` and evidence byte-identical, `pnpm test:fs-safety`, watcher and index agreement.
- Documents to change: `docs/format/` (version 2 file description and schema), spec chapters 5 and 7, `docs/adr/` index if any, fixtures README.
