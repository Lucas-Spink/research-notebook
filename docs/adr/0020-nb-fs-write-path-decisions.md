# ADR-0020: How nb-fs confines and performs writes

- Status: Proposed
- Date: 2026-09-19
- Deciders: maintainer
- Spec sections affected: 6.3, 6.5, 9.2, 9.3, 5.10

## Context

S2-T04 creates `nb-fs`, the only crate allowed to write project files (P2, spec 6.3). The specification fixes the goals (atomic write, retry on locks, NFC and forward slashes, traversal rejection, writes only in `_notebook/`) but leaves several points open that decide what can happen to a user's files. They were put to the maintainer before implementation and answered as recommended.

## Decision

1. **API.** `ProjectRelPath` is a validated, project-relative path. `ProjectRoot::open` then `ProjectRoot::write_atomic(path, bytes)` is the only write operation in this task. Move, copy, trash and hashing arrive with the tasks that need them. Paths are project-relative and must begin `_notebook/` (spec 6.5), so a write can never name a destination outside it.
2. **Backslashes** in input are converted to `/`, then the path is normalised to NFC and validated. Names the application creates never contain a backslash (spec 9.2), so nothing is lost. Segments made only of dots and spaces are refused as traversal, because Windows drops trailing dots and spaces.
3. **`_notebook` must be a real folder.** Opening a project fails if `_notebook` is missing, is a file, is a symlink or junction, or is spelt with different case. A link would make "inside `_notebook/`" depend on somewhere else.
4. **Links inside `_notebook/`.** Every write resolves links first and must land inside the resolved `_notebook/`; this is checked before any folder is created, and again after. A target that is itself a link, a folder, or read-only is refused. It is never replaced or made writable.
5. **Names.** Every segment after `_notebook/` must be Windows-safe (spec 9.2): no `<>:"|?*`, no control characters, no trailing dot or space, no device names such as `CON` or `NUL` with or without an extension. Refused on every platform so a project moves between them and a write cannot reach a device or an alternate data stream.
6. **Temporary files.** A write creates `.<name>.<pid>.<n>.tmp` beside the target (the name is cut to 100 characters), writes, flushes, and renames over the target. If the write fails before the rename, the writer removes **only the temporary file it created** (created with `create_new`, so never a pre-existing file). This is a narrow exception to "nb-fs must not delete anything outside .history, .trash, inbox and the cache" in spec 6.3. A crash can leave a stray `.tmp` file; nothing sweeps it yet. Readers, the watcher (S2-T08) and the hygiene files (spec 5.12) must ignore `*.tmp`.
7. **Retry.** A rename that fails with a lock (`ResourceBusy` everywhere; access denied, sharing violation and lock violation on Windows) is retried with pauses of 10 ms doubling to 500 ms, for five seconds in total (spec 9.3), then reported as `Locked` naming the project-relative path. Any other error is reported at once.
8. **Directory flush** after the rename is best effort on Unix and does nothing on Windows. Its failure does not turn a completed write into an error.
9. **Permissions.** The replacement takes the permissions of the file it replaces.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Allow `_notebook` to be a link and treat its target as the root | Makes containment depend on a location the user can change; refusing is the safe default (P6) and can be relaxed later by an ADR. |
| Replace a link found at the target | It would silently change what the path means; refusing is reversible, replacing is not. |
| Clear the read-only attribute and write anyway | Overrides a choice the user made on their own file. |
| Reject backslashes instead of converting them | Paths arrive from Windows callers; conversion loses nothing because the application never creates such names. |
| Leave the temporary file behind on failure | Every failed save would litter the notebook; the exception in point 6 is limited to the file the call created. |
| Use the `tempfile` crate for the temporary file | It is a runtime dependency for a few lines, and its naming would not follow spec 5.10. |

## Consequences

- **Not covered.** A race between the check and the write, for instance a link created in the moment between them, is narrowed (checked twice, before and after creating folders) but not eliminated. Hard links are not detected; a rename replaces a hard-linked file with a new one and leaves the other name alone.
- **Open work.** Sweeping stale `.tmp` files, ignoring `*.tmp` in `.gitignore` and the watcher, and snapshots before overwrite (S2-T09) are for later tasks. `clippy.toml` names `nb_fs::write_atomic`; the function is `ProjectRoot::write_atomic`.
- **Tests.** `crates/nb-fs/tests/atomic_write.rs` (S2-G05: a fault at every step, and a real writer process killed at random moments), `fs_safety.rs` (S2-G06), `confinement.rs` and `paths.rs`. The symlink-as-target test runs on Unix only, because Windows needs privilege to create one. Directory links are covered on both platforms, with a junction on Windows.
- **Dependencies.** `unicode-normalization` 0.1.25 is new, for NFC. `tempfile` and `sha2` are dev-dependencies only.
