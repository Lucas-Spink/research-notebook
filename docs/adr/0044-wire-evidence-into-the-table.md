# ADR-0044: Wire evidence into the table

- Status: Proposed
- Date: 2026-09-26
- Deciders: maintainer
- Spec sections affected: 4.3 (column table), 5.10, 7.3 (FR-TBL-06), 7.4 (FR-EVD-01, 02, 05, 08, 09, 12), 7.5 (FR-GRP-01 to 06); gates S3-G04, S3-G06, S3-G07, S4-G13

## Context

Stage 3 built each evidence feature as an engine with no caller:

- **Copy capture** (ADR-0030 §4): `ProjectRoot::capture_copy` and `applyCapture`.
- **Link and relink** (ADR-0031 §5): `observe_link`, `find_relink_candidates`, `applyLink` and `applyRelink`.
- **Inbox import** (ADR-0033): the nb-fs inbox functions and `planInboxImport`, not wired to the project-open flow.
- **Discovery** (ADR-0035 §1): `discover` and `capturedSourcePaths`.
- **The groups tree** (ADR-0036 §8): `ResultsTree`, "not yet mounted".

Each ADR left the wiring to "a later task" or "the project loader", and no stage task was ever given that work.

The S4-T10 internal alpha found the result: no file can be added to an experiment in the app. That blocks AC-01, AC-02, AC-05 and AC-13.

Wiring these features raises four questions the earlier ADRs left open:

1. How a file the person picks or drops reaches Rust without the webview holding raw paths (AGENTS.md rule 8).
2. How `artefacts.yaml` is written safely, given that `NotebookState` does not hold it and `perform` only writes files whose hash it holds.
3. Where evidence is shown and organised.
4. What happens to a file the format cannot record.

## Decision

1. **Locations, not paths.**
   - Rust turns every file the person picks or drops, and every discovery or relink result, into the location the format records: a `SourceRoot` (`"project"` or an external root) and a `SourcePath` relative to it, the newtypes from ADR-0039.
   - Commands accept locations back and resolve them with the existing `resolve_source`. The webview never holds an absolute path.
   - A file outside the project folder and every external root registered on this machine is refused, and the person is told why. The format cannot record it (format-v1.md 4.4 and "Constraints that a schema cannot check"). Registering a new external root from the app is left to a later task.
2. **No new dependency or capability.**
   - Files are picked with the Rust API of the already-installed `tauri-plugin-dialog`, as `pick_folder` already does.
   - Drops are handled in Rust from the window's drag-and-drop event, which is on by default, so `tauri.conf.json` is unchanged.
   - Rust forwards drag positions and the dropped files' locations to the webview as events. The webview may already listen to these under `core:default`.
3. **`artefacts.yaml` is part of the loaded notebook.**
   - `loadNotebook` reads each experiment's `artefacts.yaml` through `packages/format`, and its hash is held alongside the other notebook files.
   - An artefacts change becomes an ordinary `Plan`, so it goes through the same queue, first-write backup, hash-checked write, watcher and conflict handling as every other edit.
   - A malformed `artefacts.yaml` leaves that experiment's evidence read-only (AGENTS.md rule 5).
4. **The Results cell is a small file system.**
   - Closed, it shows what FR-TBL-06 asks for.
   - Opened by click, Enter or F2, the row grows in place, as a section editor does (ADR-0043), into the groups tree:
     - groups shown as folders that open and close
     - create, rename, nest and delete
     - Move to and Add to by drag, keyboard and menu
     - an Ungrouped area
     - Add files, Find files and Relink
   - Selecting a file opens its preview.
   - Only one thing is open in the table at a time: opening a Results cell saves and closes any live section editor, and opening a section closes the Results cell.
   - All adding and organising of evidence happens in the table.
5. **Order of writes.**
   - A captured file is placed first, by nb-fs inside `_notebook/`, reading but never changing its source. `artefacts.yaml` is written after.
   - A failure between the two leaves an unrecorded file inside `_notebook/`: safe, and something the Stage 6 integrity check reports.
   - Git provenance is looked up when capturing (FR-EVD-12).
6. **Inbox on open.**
   - When a writable project opens, each inbox request is planned by `planInboxImport`, carried out, and recorded in `artefacts.yaml`.
   - Only after that is its request removed. Invalid requests stay in the inbox and are listed with their reason.
   - `group_path` is still ignored (ADR-0033 §6).
7. **Discovery and relink.**
   - Discovery reports progress over a Tauri channel and is cancelled by a command setting its shared flag, as ADR-0035 §8 foresaw.
   - A relink candidate is applied only after the person confirms it (FR-EVD-08). The confirmation is the UI calling `applyRelink`, not a separate command.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Give the webview absolute paths from `onDragDropEvent` and validate them in commands | The webview would hold raw filesystem paths, which rule 8 forbids, and every command would need its own confinement checks. |
| Enable the dialog plugin's JavaScript API in the capabilities | It is a capability change on a protected path, and it still hands paths to the webview. |
| Write `artefacts.yaml` from a fresh read outside `perform` | That duplicates conflict handling and skips the first-write backup and the watcher's held files. |
| An Evidence section in the details panel | The maintainer wants all editing in the table. |
| Offer to register a new external root for an outside file | It is useful, but it adds `project.yaml` writes and root management; left to a later task. |

## Consequences

**Easier:** evidence can be added, organised, previewed and relinked in the app, and files added from VS Code arrive when the project opens.

**Harder:**

- `NotebookState` carries every experiment's artefacts, so loading reads one more file per experiment.
- The table gains a second kind of expanded row.

**Tests and gates:**

- S3-G04 now also runs the TypeScript flow that imports on open: `pnpm test:unit -- inbox-open`.
- S3-G06 names the real confirmation: the UI calling `applyRelink`.
- S3-G07 runs the Rust performance test `discovery_perf`, as ADR-0035 §10 noted.
- New gate S4-G13 covers adding files in the table: `pnpm test:unit -- evidence-capture`.
- `pnpm test:fs-safety` still proves sources and everything outside `_notebook/` are unchanged.

**Not changed:**

- S3-G09 keeps its end-to-end run command. Its only existing test runs in jsdom, which cannot prove that a real webview does not execute SVG scripts.
- No on-disk format change.
