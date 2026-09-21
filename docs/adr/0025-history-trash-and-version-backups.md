# ADR-0025: Snapshots, the trash and version-change backups

- Status: Proposed
- Date: 2026-09-21
- Deciders: maintainer
- Spec sections affected: 5.11, 6.3, 6.5, 7.11 (FR-HIS-01, FR-HIS-02, FR-HIS-04), FR-EXP-06, FR-EVD-10; gate S2-G12

## Context

S2-T09 keeps the previous content of a notebook file before it is overwritten, moves deletions to `.trash/`, and backs the notebook up before the first write by a different application version. Spec 5.11 fixes the folders and the retention policy but leaves open what `<timestamp>` looks like, which files count as "notebook text files", how "one per hour" chooses between snapshots in an hour, and how the pieces fit the rules that only `nb-fs` writes (rule 1) and only `packages/format` parses (rule 2). ADR-0024 also left three things to this task: snapshots before "Keep mine", closing the window between the last poll and a save, and the trash.

The points below were put to the maintainer before implementation. Items 1 to 4 were answered by the maintainer; the rest are recommended defaults that were approved with the plan.

## Decision

1. **Names.** `<timestamp>` is `YYYY-MM-DDTHH-MM-SSZ`: UTC, second precision, hyphens where RFC 3339 has colons because Windows forbids colons (spec 9.2). Two things made in one second are told apart by a suffix `-2`, `-3` on the timestamp, so nothing is ever replaced: `2026-09-21T10-15-00Z.md`, `2026-09-21T10-15-00Z-2.md`, `.trash/2026-09-21T10-15-00Z-2/…`, `backups/2026-09-21T10-15-00Z-2-before-0.2.0/`. A suffix of 0 or 1, or with a leading zero, is not one this code writes and is not read as a snapshot. **Spec 5.11 and `docs/format/format-v1.md` 4.8 should state this form.** Both are protected and are not edited here.
2. **Scope.** The files that keep history and go into a backup are `project.yaml`, `bibliography.json`, `questions/*.md`, `experiments/*/experiment.md` and `artefacts.yaml` (the data files the watcher and index already use), plus `README.md` and `styles/*.csl`. Never `.lock`, `inbox/`, evidence, methods, `exports/`, or the history, trash and backup folders. One predicate, `is_snapshot_scope`, decides, and extends `is_notebook_data_path` by two names.
3. **Compare before write.** `ProjectRoot::write_data_file` takes what the caller believes is on disk (`Expected::Sha256` or `Expected::Absent`) and, if the file is something else, returns `Changed` and writes nothing. This closes the window ADR-0024 left between the last poll and a save. It is an outcome, not an error, in the manner of the lock outcomes.
4. **Retention.** Every snapshot for 24 hours; from 24 hours to 7 days the newest in each UTC hour; from 7 to 90 days the newest in each UTC day; from 90 days the newest in each Monday-start UTC week, without end. Each snapshot is judged by its own age, so a snapshot 23 hours old and one 25 hours old in the same clock hour are not merged. `plan_retention(now, snapshots)` is pure and returns what to delete, which is how S2-G12 runs at any age with a mocked clock.
5. **Order of a save.** Resolve and confine the target (refusing links, folders and read-only files), compare with what was expected, copy the previous bytes to `.history/<path relative to _notebook>/<stamp>.<ext>` with the ordinary atomic write, replace the file with the ordinary atomic write, then prune. A failure at any step leaves the file as it was. A failure to prune is ignored and retried at the next save. Pruning deletes only regular files inside `.history/<that file's path>/` whose names it would itself have written, after resolving links (spec 6.3 allows deletion in `.history`). `write_atomic` is unchanged, so the lock heartbeat never makes history.
6. **The trash** moves by rename, with the retry of atomic writes, to `.trash/<stamp>/<path relative to _notebook>`. It refuses `_notebook` itself, `project.yaml`, `bibliography.json`, `.lock`, `.history`, `.trash` and `backups` (compared without regard to case, since `.TRASH` is `.trash` on Windows and macOS), anything outside `_notebook/`, links, and anything reached through a link. The command accepts only a question file or an experiment folder. Evidence versions (FR-EVD-10) come with Stage 3. Nothing is ever removed from the trash: Empty trash and restore are not built.
7. **The backup** copies every in-scope file to `backups/<stamp>-before-<version>/` without following links. Links, and names that are not valid UTF-8, are counted as `skipped` and reported. A folder that exists is never reused. `<version>` is reduced to letters, digits, `.`, `+` and `-` (anything else becomes `_`, a trailing dot too) and cut to 64 characters.
8. **Who decides a backup is due.** `last_written_by` is in `project.yaml`, which only `packages/format` parses. The webview compares it with the build's version (`needsVersionBackup`, exact string difference, so a downgrade also counts) and calls `backup_for_version_change`, which takes no version: Rust names the folder with its own `CARGO_PKG_VERSION`, as the lock does. `createFirstWriteGuard` makes the backup once, shares it between writes that start together, and refuses a write whose backup failed. Rewriting `last_written_by` afterwards belongs to whatever saves `project.yaml` (S2-T10 onwards).
9. **The commands** (`write_notebook_file`, `move_to_trash`, `backup_for_version_change`) delegate to `nb-fs` and refuse with `notWritable` unless this application holds the project's lock. That makes "a read-only project never gets a snapshot, trash folder or backup" (S2-G04) true in the backend, not only in the webview. `write_notebook_file` takes a validated `NotebookPath`, the same predicate as the read command.
10. **Dependencies.** None. The timestamp is the existing hand-written `lock::Timestamp`; `sha2` was already a dependency of `nb-fs`.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| `YYYYMMDDTHHMMSSZ` for the stamp | Chosen against by the maintainer in favour of the hyphenated RFC 3339 form. |
| Snapshot only the five parsed data files | `README.md` and styles are edited by hand and are cheap to keep. |
| Keep the oldest snapshot in each bucket | Keeps the state at the start of a period; the newest is what a person recovering from a mistake wants. |
| Snapshot inside `write_atomic` | The lock heartbeat writes every minute and would fill `.history` with lock files. |
| Read `last_written_by` in Rust | Would be a second parser of `project.yaml` (rule 2). |
| Let the webview name the backup's version | A second source of the version that could disagree with the build. |
| Refuse an existing backup folder | A failed or repeated backup would then block every later write. A suffix never loses either. |
| `empty_trash` now | A destructive function with no caller. It should arrive with the confirmation that guards it. |
| A generic `move_to_trash(path)` command | A generic file command, against spec 6.5. |

## Not in this task

- Browse, compare and restore snapshots (FR-HIS-03, a *Should*) need the editors of S2-T10 to S2-T12. Restoring must snapshot the current content first, which `write_data_file` already does when called with the current hash.
- Emptying the trash, and restoring from it.
- Conflict copies made by Dropbox, OneDrive and iCloud (FR-HIS-06).
- Sweeping stray `.tmp` files (ADR-0020).

## Consequences

- **"Keep mine" can now be wired to a write.** ADR-0024 (Consequences) said it was unsafe until snapshots existed. Saving with `expected` set to their hash snapshots their version first. The wiring belongs to S2-T12.
- **Autosave must be coalesced.** "Every snapshot for 24 hours" means each save makes one. An editor saving every few seconds would make thousands of snapshots of a file a day. S2-T12 must save on a pause, not on every keystroke. There is no size cap on `.history`, and the weekly tier never expires.
- **A window remains, of the order of a millisecond,** between comparing the hash and renaming the new file into place. Closing it would need operating-system file locking. The project lock keeps other instances of this application out; another program can still win the race.
- **A crash during a backup can leave a partial backup folder.** The caller then does not write, and the next attempt uses a suffixed folder. Nothing may delete under `backups/` (spec 6.3), so the partial one stays.
- **Retention thins as time passes, not once.** Pruning at each save means a snapshot can be removed while it is still hourly because a newer one shares its hour, so the day it belongs to is later held by that newer one, still hourly, rather than by a daily one. No hour, day or week that had a snapshot is left without one (`pruning_as_time_passes_leaves_no_gap_in_any_tier`); the counts by tier are a little different from a single pruning.
- **Links are refused, not followed,** for saves, the trash and backups alike, including directory links inside `_notebook/` (junctions on Windows, tested; symlinks to files are tested on Unix only, because Windows needs privilege to create one).
- **Windows only.** Everything was run on Windows. The rename-into-trash and backup behaviour has not run on macOS.
- **Not driven by hand.** No editor calls the commands until S2-T10 to T12, so they were checked through `nb-fs` and the pure command-layer functions (path validation, the lock guard, result shapes) but not through a running window. The Tauri `State` wiring of the three commands has no test of its own. The bindings were regenerated by a debug launch of the application, which the code comment in `lib.rs` describes as the way, and was not edited by hand.
- **Tests.** `crates/nb-fs/tests/history/` (`history_retention` is S2-G12, with property tests; stamp, scope, snapshot with fault injection, trash, backup), the live watcher test that these folders are not reported, the S2-G06 scenario in `fs_safety.rs`, the command-layer tests in `commands/projects/history.rs`, and `features/history/model/version-backup.test.ts`.
