# ADR-0031: Link mode and relink design

- Status: Proposed
- Date: 2026-09-22
- Deciders: maintainer
- Spec sections affected: 7.4 (FR-EVD-02, FR-EVD-07, FR-EVD-08); gate S3-G03, S3-G06

## Context

Files above the copy threshold are recorded in place rather than copied (ADR-0003): `artefacts.yaml` holds a hash, size and observed modification time instead of a version file. S3-T02 has to decide three things the spec states as outcomes but leaves open as mechanism: how a link's identity is recorded and re-checked without ever copying the file (FR-EVD-07), what "unavailable" means when the schema has no field for it (FR-EVD-08), and how wide a relink's search for the missing file's new location should reach, given that folder scanning with excludes, cancellation and progress is Discovery's job (S3-T07), not this task's.

## Decision

1. **Availability is never persisted; only `checked` is.** `artefacts.yaml`'s `link` object (format-v1.md 4.4) has exactly `sha256`, `size`, `observed_mtime` and `checked` — no availability flag. So a missing file changes nothing on disk beyond recording that a check happened (`applyLinkChecked` in `packages/format`, `checked` alone); "unavailable" is computed by a caller comparing a live `stat` against the stored record, the same way a newer-version indicator (FR-EDT-07) is computed rather than stored. This is also what makes FR-EVD-08's "without altering notes" literal rather than a promise a write path has to keep.
2. **Two checks, not one, matching FR-EVD-07's own wording.** `nb_fs::link::stat_link` is a bare `fs::metadata` call — presence, size, modification time, no bytes read — for the check spec 7.4 says happens "on open". `nb_fs::link::observe_link` reads and hashes the whole file, for the check spec 7.4 says happens "on demand" and for recording a link's identity in the first place (there is no cheaper way to record a hash than to read the file once). Callers choose which one to run; neither is preferred by the engine.
3. **Relink searches one folder's direct entries, not the disk.** `find_relink_candidates(folder, expected)` lists `folder`'s direct entries only, hashes each, and keeps the ones matching at least one of the last known name, size or hash, ranked hash-first. A person is expected to point the app at roughly where the file went (the common case: it was moved or renamed one directory over), not to run a general search. A recursive, glob-filtered, cancellable scan of an unbounded tree is Discovery (S3-T07, FR-EVD-09), which this task deliberately does not re-implement; if a future task wants relink to search recursively, it can hand `find_relink_candidates` a wider set of folders or compose it with Discovery's walker, since ranking is already a pure function of a expectation and a list of files.
4. **Confirmation is a distinct function, not a flag.** Ranking (`find_relink_candidates`, and `applyLinkChecked` for an ordinary availability check) never writes anything. Applying a chosen candidate (`applyRelink` in `packages/format`) is a separate call that a caller only reaches after the person confirms one candidate — there is no parameter that lets a candidate apply itself, so "never applies without confirmation" (FR-EVD-08) is a fact about the API shape, not a runtime check that could be bypassed.
5. **Scope: the engine only, matching ADR-0030's boundary for copy capture.** This task ships `nb_fs::link` (`observe_link`, `stat_link`, `find_relink_candidates`) and `packages/format`'s `applyLink`, `applyLinkChecked`, `applyRelink` (given an `ArtefactsFileModel` already parsed, the same shape `applyCapture` uses) plus `decideCaptureMode` for the copy/link threshold (FR-EVD-02). None of this is wired to a Tauri command, IPC binding or UI, for the same reason ADR-0030 gave: `NotebookState` still has no notion of `artefacts.yaml`, and resolving `source.root`/`source.path` against a project's external roots (needed to turn a relink candidate's absolute path back into a `source` value) is the project loader's job (spec 5 "Constraints that a schema cannot check", FR-PRJ-07), not this crate's or this package's.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Store an `available` flag on the artefact | Not in the schema (format-v1.md 4.4), and adding one is a format change requiring an ADR and migration of its own (AGENTS.md rule 3) for a value fully derivable from a live check — the spec's own FR-EVD-08 wording ("without altering notes") reads as a deliberate choice not to persist it. |
| One `check_link` function that always hashes | Simpler API, but spec 7.4 explicitly names two different checks ("by size and time" on open, "by hash on demand"); always hashing would make the cheap on-open check as expensive as the deliberate one, which matters once a linked file can be many gigabytes (format-v1.md's own example is 18.4 GB). |
| Have `find_relink_candidates` walk the whole project or an arbitrary depth recursively | Duplicates Discovery's glob/exclude/cancel/progress machinery (S3-T07, FR-EVD-09) ahead of that task, for a feature (locating one missing file) that does not need it; a shallow, explicit folder is also what stays fast without a progress mechanism. |
| Fold ranking and applying into one `relink` call that takes a chosen index | Makes "never applies automatically" a matter of caller discipline (passing no index yet) rather than an API that has no way to call it wrong; gate S3-G06 asks for candidates to be inert until a separate confirm step. |

## Consequences

- **A relink to a location outside the folder searched needs a second search**, or a caller-supplied folder further up or down the tree; there is no single call that finds a file that moved anywhere on disk. Acceptable for the same reason Discovery is a separate, later task.
- **`applyLinkChecked` writes `artefacts.yaml` on every availability check**, including ones that find nothing wrong. This is one small YAML write (not a copy or a hash of evidence), consistent with how the rest of the format already treats `checked`-style timestamps.
- **Tests.** `crates/nb-fs/tests/link.rs` (`observe_link`/`stat_link` on present, missing and folder-shaped paths), `crates/nb-fs/tests/relink.rs` (ranking order, hash-match priority as a property test, no writes, gate S3-G06), the extended S2-G06/S3-G03 scenario in `fs_safety.rs`, and `packages/format/src/notebook/link.test.ts`, `link.property.test.ts` and `capture-mode.test.ts`.
