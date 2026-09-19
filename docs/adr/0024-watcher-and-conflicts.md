# ADR-0024: The watcher and conflicts

- Status: Proposed
- Date: 2026-09-19
- Deciders: maintainer
- Spec sections affected: 6.4 (step 5), 6.5, 7.11; gate S2-G08; acceptance AC-11

## Context

S2-T08 reloads files changed on disk by something else (FR-HIS-05) and, when the person has unsaved edits to such a file, keeps both versions and shows a conflict view. Three things the task depends on do not exist yet: the editors that hold unsaved text (S2-T12), the questions and experiments the index and table load (S2-T10, S2-T11), and snapshots before overwrite (S2-T09). Two rules in the written guidance also pull against what the task needs:

- Spec 6.5 says there is no generic read command, yet reloading a file and showing "their" side of a conflict need the file's text in the webview.
- ADR-0022 point 8 chose polling over Tauri events so `capabilities/` (protected) is not touched.

The points below were put to the maintainer before implementation and the recommended answers were chosen, except item 6, which arose during implementation and is flagged.

## Decision

1. **Slice.** `nb-fs` gets a watcher; the app gets commands to start, poll and stop it; the webview gets a pure conflict model, a session that applies reports to the files it holds, a conflict view, and a hook. The one real consumer is `project.yaml`, which has no editor and is therefore always clean: an outside edit reloads the project shown and decides its mode again. Editors register their files with the same hook when they exist (S2-T12).
2. **The watcher** (`nb_fs::watch`, on `notify` 8.2.0) watches `_notebook/` recursively and reports only notebook data files: `project.yaml`, `bibliography.json`, `questions/*.md`, and `experiment.md` and `artefacts.yaml` in each folder of `experiments/`. This is the set `nb-index` scans; `nb-index/tests/watch_agreement.rs` keeps the two equal. Temporary files of an atomic write (dot-prefixed), evidence, history, trash, inbox and the lock are not reported.
3. **Debounce.** A pure state machine (`Coalescer`) driven by an injected clock reports a path once it has been quiet for 300 ms, or after 2 s if it never is. Each settled file is then read and hashed (retrying for about a second when Windows will not open it) and reported as present with its SHA-256, missing, or unreadable. A removed or renamed folder of data files, an error from the operating system and a lost-events notice all become `needs_rescan`, because some platforms report only the folder.
4. **The watcher only reads.** It never writes, renames or removes anything; `tests/watch/live.rs` and the S2-G06 scenario check it.
5. **Own writes are recognised by hash, in the webview.** The watcher reports the application's own atomic writes like anyone else's. The model records the hash of a save before it is written (`saving`), and a report matching it is that save's echo, not an outside change. This keeps Rust free of any link between `write_atomic` and the watcher.
6. **A read of the fixed set of data files** (`read_notebook_file`, backed by `ProjectRoot::read_data_file`). It returns the file's text exactly as on disk and the SHA-256 of those bytes, accepts only paths that pass the same predicate as the watcher, refuses links that leave `_notebook/`, non-UTF-8 text and anything else, and never writes. It takes a validated `NotebookPath`, not free text. This departs from a strict reading of spec 6.5's "no generic read": it is not generic, but it is a new way for the webview to read project files, so **the maintainer should confirm it**. It is the sibling of `read_project_yaml`.
7. **Polling, not events.** `poll_project_changes` drains the batch and the hook asks about once a second. `capabilities/` and `tauri.conf.json` are untouched. A poll of a project not watched says so (`watching: false`), and the hook then restarts the watch and checks everything.
8. **The model** (`features/conflicts/model/tracker.ts`) holds, for each file: the hash it is based on, any unsaved text, saves in flight, and a conflict. It compares hashes and never text. A clean file with an outside change is reloaded; a file with unsaved edits gets a conflict holding both versions and the local text is never touched; a change that puts the file back to what it is based on ends the conflict; text typed while a read is under way turns that read into a conflict instead of being overwritten. The session applies every change to the latest state through a synchronous store, never to a copy taken before a read, so a slow read cannot erase what was typed.
9. **Both versions live in memory.** Nothing is written to disk to keep them: an on-disk conflict file would be a format change (AGENTS.md rule 3). The conflict view shows both as text, never as markup, and offers keep mine or use theirs (accept the removal, if they removed the file). Resolving hands the choice to the owner of the buffer and **writes nothing itself**.
10. **`project.yaml` reload** decides the mode again in the order of spec 6.4 step 2, the file's own reasons before the lock. A project that becomes read-only because of the file (newer format, invalid, removed, archived) lets go of its lock. One that was read-only only because of the file asks for the lock again once it is fixed. One held read-only by a lock keeps that reason.
11. **Dependency.** `notify` 8.2.0, pinned. CC0-1.0, on the `deny.toml` allow-list; `cargo deny check` passes. `sha2` 0.10.9, already locked, moves from a dev-dependency of `nb-fs` to a dependency.

## Not in this task

- FR-HIS-06 (conflict copies made by Dropbox, OneDrive and iCloud) is a *Should* and is not in the task's definition of done.
- Snapshots before overwrite, the trash and retention are S2-T09.
- Editors, and the index being updated from the watcher, need S2-T10 to S2-T12.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Tauri events from Rust to the webview | Needs a listener and possibly a capability entry (protected) for something polling does as well within a second. |
| `notify-debouncer-*` | A second dependency for about 100 lines that must be tested with an injected clock anyway. |
| Suppress the application's own writes in Rust | Couples `write_atomic` to the watcher through shared state, and still cannot tell a save in flight from an outside edit made at the same moment. Hashing in the model can. |
| Write the local version to `_notebook/` when a conflict starts | Survives a quit, but is an on-disk format change (rule 3) and needs a version bump, migration, ADR and approval. |
| Make the conflict view write the chosen text | "Keep mine" overwrites their version, which would then exist nowhere on disk until S2-T09 snapshots it. |
| Reload files in Rust and push text to the webview | Puts file content on the event path and makes Rust decide about unsaved edits it cannot see. |
| No new read command; carry only hashes | The conflict view cannot show their side and nothing can be reloaded. |
| Watch only `project.yaml` | Leaves the watcher unable to serve questions and experiments when they exist. |

## Consequences

- **Spec 6.5 and AGENTS.md section 4 need a note** (protected or specification text, not edited here): the read command of item 6, and `nb-fs` owning the watcher, which the spec's `nb-fs` row already lists.
- **The unsaved text is lost if the application closes during an open conflict.** It was never saved, so nothing on disk is lost, but the person loses those edits. S2-T09's history, or a quit guard in S2-T12, is the durable answer.
- **"Keep mine" is not safe to wire to a write until S2-T09.** Saving it replaces their version, which would then be recoverable from nowhere. `Resolution.keepMine` returns the text and changes the base to their version so the save is a knowing overwrite, but the save itself belongs to the editor task and must snapshot first.
- **There is a window between the last poll and a save.** An outside edit made in it is not seen before the write. Closing it needs a compare-before-write in the save command (the file's hash must still be the base), which belongs to S2-T09 and S2-T12.
- **Latency.** A change is reported after 300 ms of quiet and shown at the next poll, so within about 1.5 s.
- **Where events do not arrive.** Network shares and some cloud-synced folders may deliver no events at all. `needs_rescan` covers lost events, not silence. A periodic or manual rescan is not built.
- **Windows only.** Everything was run on Windows; the macOS watcher backend (`fsevent`) has not run. The real-filesystem tests wait on the watcher with a timeout, so they are timing-dependent by nature; the negative ones wait out 1.5 s.
- **Not verified in the running application.** The commands, the polling hook and the projects screen were not driven by hand. S2-G08's manual half (an edit in VS Code while the application is open) is still to be done.
- **Accessibility** of the conflict view is checked structurally (role, labelling, disabled state); there is no automated accessibility tool in the repository yet.
- **Tests.** `crates/nb-fs/tests/watch/` (filter, debounce with an injected clock, live filesystem, registry), `read_data_file.rs`, the watcher in the S2-G06 scenario, `nb-index/tests/watch_agreement.rs`; and `watcher-conflict*.test.ts` (model, session, `project.yaml` reload and seeding), its property test (S2-G08), and `ConflictView.test.tsx`.
