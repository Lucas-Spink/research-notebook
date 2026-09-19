# ADR-0023: The derived index

- Status: Proposed
- Date: 2026-09-19
- Deciders: maintainer
- Spec sections affected: 6.3, 6.4, 6.6, 9.4; gate S2-G07

## Context

S2-T07 builds `nb-index`, the SQLite index of spec 6.6. Three rules in the written guidance pull against what an index of parsed content needs:

- AGENTS.md rule 2 and ADR-0002: only `packages/format` parses notebook files, yet the index holds questions, experiments, artefacts, references and citations that come from parsing them.
- AGENTS.md rule 1: `std::fs` writes and removals are forbidden outside `nb-fs`, yet a damaged database has to be removed from the cache folder before a new one can be made, and the folder has to exist before SQLite can create a file in it.
- The section 4 table says `nb-index` depends on `rusqlite` only, yet it needs the validated project path type and the cache folder helper.

The points below were put to the maintainer before implementation and the recommended answers were chosen.

## Decision

1. **`nb-index` never parses.** It reads a project's files only to size, time and hash them. Its API is in two steps. `Index::scan` compares the notebook data files on disk with the `files` table and returns those changed and those removed. The caller parses each changed file with `packages/format` and passes the rows, as the typed records in `records.rs`, to `Index::apply`, which replaces them in one transaction. A full rebuild is `Index::rebuild_scan` (empty the index, report every file as changed) followed by the same `apply`. Wiring the parser to `apply` over IPC belongs to the tasks that load questions and experiments (S2-T10, S2-T11); T07 ships the crate only. The tests stand in for the parser with a function of the file text.
2. **Which files are indexed.** `project.yaml`, `bibliography.json`, `questions/*.md`, and `experiment.md` and `artefacts.yaml` in each folder of `experiments/` (format-v1.md section 1). Evidence, methods, `.history`, `.trash`, `inbox`, `.lock`, hidden names and links are not listed. Directories are listed one level at a time, never walked, so a large `evidence/` folder costs nothing. Keys are project-relative with the `_notebook/` prefix, in the form of `ProjectRelPath`.
3. **Change detection.** A file is unchanged when its size and modification time match the row in `files` (`ScanMode::Quick`, no read). Otherwise it is hashed with SHA-256: an equal hash means unchanged, and the new size and time are stored so the next quick scan skips it; a different hash means changed. `ScanMode::Full` hashes every file, so an edit that kept both size and time is still found. A rebuild always uses it. Which mode the application uses on open is for the caller to decide. A file that cannot be read now is reported in `Scan::unreadable` and keeps its rows.
4. **Schema.** All ten tables of spec 6.6 are created now, plus `fts`, so Stage 3's tables (versions, groups, memberships, references) exist empty and need no change later. Every row carries its `file`, and `ON DELETE CASCADE` removes a file's rows with it; FTS5 rows are deleted by hand. There are no unique keys on ids: two files sharing an id is a project fault the loader reports (format-v1.md section 5), and the index must still describe the files as they are. `fts` has one indexed column (`text`) and three unindexed ones (`file`, `kind`, `owner`), with the `unicode61` tokeniser and accents removed. `Index::search` treats the query as text, not FTS5 syntax: each word becomes a quoted prefix phrase, all are required, and words with no letter or digit are dropped.
5. **Version and reset.** The schema version is SQLite's `user_version` (currently 1). On open, another version, a failed `quick_check`, a missing table, or a `NotADatabase` or `DatabaseCorrupt` error discards the database; everything else, such as a busy database, is returned and nothing is removed, because another instance may be using a good index. Discarding removes `index-<project id>.sqlite` and its `-journal`, `-wal` and `-shm` files, and makes an empty database. The outcome (`Created`, `Reused`, `Reset(reason)`) is returned so the caller knows the index must be repopulated. There is no migration: the index is disposable (P1, AC-08).
6. **One database per project**, `index-<project id>.sqlite` in the cache folder (spec 9.4). The id must be 1 to 64 ASCII letters, digits, `-` or `_`; anything else is refused, not escaped. The cache folder is passed in by the application and never resolved by the crate.
7. **`nb-fs` gets a `cache` module** (`CacheDir`): `ensure` creates the folder, and `remove_file` removes one file in it, only if its name is a single plain visible name (no separators, drive letter, leading dot or control character) and it is a file, not a folder or link. A missing file counts as removed. Nothing else in the cache is written or removed through it. This is the delete permission spec 6.3 already gives `nb-fs` for the cache, made concrete. `nb-fs` is a protected path; the change is small and flagged for review.
8. **`nb-index` depends on `nb-fs`** for `ProjectRoot` (the resolved `_notebook` folder, which is never a link), `ProjectRelPath` and `CacheDir`. It calls no `std::fs` write or removal itself; SQLite writes its own database file.
9. **Dependencies.** `rusqlite` 0.40.2 with `bundled` and `cache` (default features off), `sha2` 0.10.9 (already locked, and already a dev-dependency of `nb-fs`), and nothing else new. `bundled` compiles SQLite from C with FTS5 enabled, so behaviour does not depend on a system library on either platform; it needs a C toolchain, which Tauri already requires. Licences: `rusqlite` and `libsqlite3-sys` are MIT, SQLite is public domain; `cargo deny check` passes with no allow-list change.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Parse the files in Rust for the index | Breaks rule 2 and ADR-0002, and creates a second parser to keep in step with the format. |
| A callback passed to `scan`, called for each changed file | Needs the parser inside the call, but the parser is TypeScript in the webview. Two steps let the caller run it wherever it lives, and keep the crate testable without one. |
| Trust size and time only | Misses an edit that keeps both (coarse clocks, tools that restore times). The spec says hash. `Full` mode covers it, and `Quick` stays cheap. |
| Hash every file on every open | Simple, but reads every file each time. Quick mode is what makes a warm open cheap (NFR-PERF-01). |
| Walk `_notebook/` recursively | Descends into evidence and history for nothing, and lists files the format layer never parses. |
| Unique keys on ids | Turns a project fault the loader is meant to report into an index failure. |
| Drop tables in place instead of removing the file | Cannot recover from a file SQLite cannot open, and FTS5 shadow tables complicate dropping. Removing the file handles every case the same way. |
| `nb-index` removes its own database with `std::fs` | Breaks rule 1 or needs a clippy exception in a crate that should not have one. |
| Create only the Stage 2 tables now | Every Stage 3 task would bump the schema version and rebuild for tables spec 6.6 already names. |
| `rusqlite` without `bundled` | FTS5 depends on the system SQLite build, which differs between Windows and macOS. |
| `blake3` or another hash | The format uses SHA-256 throughout, and `sha2` is already locked. |

## Consequences

- **AGENTS.md section 4 and spec 6.3 need updating** (protected or specification text, not edited here): the `nb-index` row should allow `nb-fs`, and the spec's `nb-fs` row should name the cache folder's creation as well as deletion.
- **A file edited between the scan and the parse is not lost.** Each update stores the metadata from the scan, so the next scan sees the file as changed and parses it again.
- **Quick scans trust the clock.** A tool that edits a file and restores its size and time leaves the index stale until a full scan or a later edit. The caller can run `Full` at intervals; the rebuild always does.
- **Two instances on one project share a database.** SQLite's locking keeps it consistent and a busy database is reported, not removed. Whether a second instance should have its own index is for the task that opens projects.
- **Performance is not measured here.** NFR-PERF-01 and NFR-PERF-02 (S2-G14) need the table and the large fixture (S2-T11, S2-T13). Applying is one transaction with cached statements, and FTS deletion by file scans the FTS table, which is acceptable for an update of a few files; a rebuild starts empty and never deletes.
- **Tests.** `crates/nb-index/tests/`: `rebuild.rs` (S2-G07, a property over random edit, removal, sync and reopen sequences, plus fixed histories), `schema.rs`, `scan.rs`, `fts.rs` and `safety.rs` (nothing in the project changes, whatever the index does), and `crates/nb-fs/tests/cache.rs`. The parser is a stand-in, so the rows of a real project are not exercised until the wiring exists. The property test runs 64 cases by default and takes `PROPTEST_CASES`.
- **Windows only.** Everything was run on Windows. The symlink test is `cfg(unix)` and has not run anywhere yet.
