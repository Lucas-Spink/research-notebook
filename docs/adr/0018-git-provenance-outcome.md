# ADR-0018: git provenance captured via gix alone

- Status: Proposed
- Date: 2026-09-18
- Deciders: maintainer
- Spec sections affected: 7.4

## Context

S1-T09 spiked whether the pure-Rust `gix` library is sufficient to read a
repository's HEAD commit, file-dirty and tree-dirty state for evidence
provenance, or whether shelling out to the `git` CLI is required. This
directly resolves the open question in spec 15.2, "Whether gix status
support is sufficient or the git CLI is required," due by Stage 1.

## Decision

Use `gix` alone for provenance capture; do not shell out to the `git` CLI
for this purpose. Evidence in
`apps/desktop/src-tauri/crates/nb-git/src/lib.rs`,
`provenance_for_path()` (lines 95-135):

- HEAD commit: `repo.head_id()?.to_string()` (line 118).
- Tree-dirty: `repo.is_dirty()?` (line 119).
- File-dirty: a scoped status walk on the single file's pathspec (lines
  121-126), non-empty result meaning dirty.
- No shell-out anywhere in `src/`; only `gix::discover` and
  `gix::bstr::BString` are used. (Fixture setup in
  `tests/provenance.rs:75-86` shells out to the real `git` CLI, but only to
  *build* test repositories — not something `nb-git` itself does.)
- 7 tests in `tests/provenance.rs` pass, covering HEAD match, a clean repo,
  a modified target file, a modified unrelated file, a commit clearing both
  flags, a path outside any repo, and forward-slash path normalisation.

This is a narrower question than "is the git CLI ever needed" — the CLI
stays available for unrelated future needs (e.g. `git bundle` in S6-T04);
this decision covers only provenance capture.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Shell out to `git status`/`git rev-parse` for provenance | `gix` already provides equivalent status and HEAD information without spawning a process per capture, and AGENTS.md restricts `nb-fs`-adjacent crates from arbitrary process execution; `gix` avoids that surface entirely. |

## Consequences

- Update spec 15.2: change "Whether gix status support is sufficient or the
  git CLI is required | Resolve by Stage 1" to record this ADR as the
  resolution (proposed as a diff in the S1-T11 PR, not applied directly).
- Not yet tested: submodules, bare repositories beyond the explicit
  `BareRepository` error path, and detached HEAD. None of these produced a
  bug in this spike — they simply weren't exercised, since all fixtures are
  single-branch, non-submodule repositories. Add coverage before relying on
  this for evidence captured from repositories with those properties.
- `repo_root` is currently returned as an absolute path; converting it to
  the spec 5.8 project-relative `repo` field is deferred to whoever calls
  `nb-git` in Stage 3 (S3-T04).
- `gix` is pinned at 0.87.1 with `default-features = false, features =
  ["status", "sha1"]` in `nb-git/Cargo.toml`.
