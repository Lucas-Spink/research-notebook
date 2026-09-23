# ADR-0035: Discovery design

- Status: Proposed
- Date: 2026-09-23
- Deciders: maintainer
- Spec sections affected: 7.4 (FR-EVD-09), 9.4, 10.1 (NFR-PERF-05); gate S3-G03, S3-G07

## Context

S3-T07 builds discovery (FR-EVD-09). It scans a chosen folder with include and exclude globs, starting from a default list of clutter to exclude. The scan can be cancelled, shows progress, and marks sources already captured. NFR-PERF-05 requires the first progress report within 500 ms and cancellation within 1 s on 50,000 files. The spec states what discovery must do but leaves six things open:

- the glob dialect
- how "already captured" is decided
- which platform's clutter list applies
- whether the scan follows links
- how progress and cancellation reach the caller
- where the performance gate runs, since S3-G07 names `pnpm bench -- discovery` but no benchmark harness exists (ADR-0029), while spec 10.1 says NFR-PERF-05 is "measured by integration test"

## Decision

1. **Scope: the engine only, as in ADR-0030 §4, ADR-0031 §5 and ADR-0033 §1.** This task ships:
   - `nb_fs::discovery::discover`
   - `packages/format`'s `capturedSourcePaths`, which reads source paths from `artefacts.yaml` models that are already parsed

   Nothing is wired to a Tauri command, IPC or UI. Two things are left to the project loader, as ADR-0031 left them:
   - resolving the chosen folder to a `source.root` and a path within it
   - turning a proposal into a capture
2. **Glob dialect: the `glob` crate's `Pattern`, with gitignore-like scoping.** Matching is case-insensitive and `*` never crosses a `/`.
   - A pattern without `/` matches a file or folder name at any depth, so `node_modules` or `*.csv` works anywhere.
   - A pattern with `/` matches the whole path relative to the chosen folder, so `results/**/*.csv` works.
   - An empty `include` means every file.
   - `exclude` applies to folders and files alike, and wins over `include`.
   - Case-insensitive matching fits spec 9.4, which says both platforms' default filesystems are case-insensitive.
3. **An excluded folder is never entered.** Exclusion is checked when a folder is found, not after walking it. This is what keeps a 10,000-file `node_modules` free to skip, and `folders_visited` exposes it for tests.
4. **Default excludes are the union of both platforms' clutter lists.** That is FR-EVD-09's list plus spec 9.4's `desktop.ini`, applied on Windows and macOS alike. A results folder made on a Mac and scanned on Windows still carries `.DS_Store` and `._*` files.
5. **`_notebook` folders are always skipped, at any depth, whatever the options say.** Their `evidence/` and `methods/` files are captures, not sources, so proposing them would invite capturing a capture. This applies at any depth because a person may choose a folder above the project root.
6. **Links (symlinks and Windows junctions) are neither followed nor proposed.** Not following links prevents cycles and keeps the scan inside the chosen folder. Links to files are not proposed either: capturing through one records a path that can later point somewhere else.
7. **"Already captured" is decided by source path, not content.** The caller passes the captured paths relative to the chosen folder, usually from `capturedSourcePaths`. `nb-fs` compares them after unifying separators, NFC normalisation and lower-casing. Matching by content would mean hashing every file, which is a full read of the folder and cannot meet NFR-PERF-05. A moved file is caught later: capture's own dedupe (FR-EVD-05) warns when its content matches an existing artefact.
8. **Progress is a callback; cancellation is a shared `AtomicBool`.**
   - The callback runs once at the start, every 256 entries and once at the end. Counting entries rather than time keeps the engine free of clocks.
   - The flag is checked before every entry. A cancelled scan returns what it found so far, with `cancelled: true`, rather than an error.
   - A future command can forward the callback over a Tauri channel and set the flag from a cancel command, without changing this API.
9. **Only the chosen folder itself can fail a scan.** If it is missing, is not a folder, or cannot be read, the scan fails. An unreadable subfolder, an entry whose metadata cannot be read, or a name that is not valid Unicode is listed in `skipped` and the scan carries on.
10. **NFR-PERF-05 is checked by a Rust integration test,** `crates/nb-fs/tests/discovery_perf.rs`, as spec 10.1 says. S3-G07's `pnpm bench -- discovery` command still has no harness, so that gate row needs updating, or a benchmark wrapper needs adding, in a later task.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Write a small glob matcher by hand | About 120 lines of well-known but bug-prone code. `glob` 0.3.4 is already a runtime dependency of tauri, so using it adds no crate to the lockfile. |
| `globset` or `ignore` (full gitignore semantics) | They would add new crates, and `ignore` would also read `.gitignore` files, which FR-EVD-09 does not ask for. |
| Mark captured files by hash | This requires reading every byte under the chosen folder, which is incompatible with NFR-PERF-05. Capture's dedupe already covers the moved-file case. |
| Apply only the current platform's clutter list | Folders are routinely shared between platforms, and the other platform's clutter is never a result file anyone wants to capture. |
| Follow links, tracking visited folders to avoid cycles | This could leave the chosen folder, and on Windows, junction identity needs extra platform code to track. Nothing in FR-EVD-09 asks for it. |
| Time-based progress throttling | It would need a clock in the engine or an injected one. Counting entries gives the same responsiveness on real disks and is deterministic in tests. |

## Consequences

- Glob case-insensitivity in `glob` 0.3.4 covers ASCII only, so `É` and `é` in a pattern are not treated as the same letter. Captured-path marking does fold non-ASCII case.
- A file moved since capture is proposed as new, not marked. Capture's dedupe warns about it when the person captures it.
- Tests:
  - `crates/nb-fs/tests/discovery.rs`: behaviour tests, plus a proptest that no file under an excluded folder is ever reported. Its unreadable-folder test runs on Unix only.
  - `crates/nb-fs/tests/discovery_perf.rs`: the 50,000-file NFR-PERF-05 check.
  - The discovery scenario in `fs_safety.rs` (S2-G06/S3-G03).
  - `packages/format/src/notebook/discovery.test.ts`.
