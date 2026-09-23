# ADR-0032: Git provenance on capture

- Status: Proposed
- Date: 2026-09-23
- Deciders: maintainer
- Spec sections affected: 5.8 (`provenance`), 7.4 (FR-EVD-12)

## Context

ADR-0018 (the S1-T09 spike) proved `gix` sufficient for HEAD commit, file-dirty and tree-dirty detection, but left `nb-git`'s `repo_root` absolute, deferring "turning it into the project-relative `repo` field from spec 5.8" to "whoever calls `nb-git` in Stage 3 (S3-T04)". Spec 5.8 says `provenance.repo` is "the repository root relative to the project root; `.` for the project root", and its type (`RepoPath`) is `.` or a `RelativePath`, which spec 5.2 defines with no `..` segments. That covers a repository that *is* the project root or is nested *inside* it, but not one that *contains* the project root (a project folder nested inside a larger repository) or one unrelated to it (plausible for a captured file whose source is a registered external root, spec 5.8 `source.root`, which by definition lives outside the project folder). Neither is expressible without `..`.

## Decision

1. **`nb-git` gains the project-relative wrapper, not `nb-fs`.** `provenance_in_project(file_path, project_root)` calls the existing `provenance_for_path` and converts its absolute `repo_root` using a new pure function, `repo_relative_to_project`, kept private and tested in isolation (`src/lib.rs`'s own `#[cfg(test)]` module, following the precedent of `nb-fs`'s `names.rs`). `nb-fs` is untouched: its documented dependency list in AGENTS.md §4 ("std, hashing, `notify`") does not include git, and `capture_copy` still only hashes, verifies and places bytes. A future caller (still unbuilt, matching ADR-0030/ADR-0031's scope) calls `nb-git` and `nb-fs` independently and combines their results in `packages/format`.
2. **A repository root that is not the project root or a descendant of it means no provenance is recorded for that version**, exactly as if the source were not inside a repository at all. `repo_relative_to_project` returns `None` for a strict ancestor of the project root and for an unrelated path, and `provenance_in_project` treats that `None` the same as "not in a repository". FR-EVD-12 already makes provenance conditional ("when the source lies in a repository"); this extends that condition to "and the repository's root is expressible under spec 5.2's path rules" — recording nothing is preferable to writing a value the schema would reject, or silently loosening the schema to allow `..`.
3. **`packages/format`'s `applyCapture` accepts provenance as an optional, separate field of `CapturedFile`**, mapped from the caller's camelCase (`pathInRepo`, `fileDirty`, `treeDirty`) to the schema's snake_case (`path_in_repo`, `file_dirty`, `tree_dirty`) the same way `link.ts` already does for `observedMtime`/`observed_mtime`. No schema change: `Version.provenance` and `Provenance` have existed since S2-T01.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Give `nb-fs` a dependency on `nb-git` and compute provenance inside `capture_copy` | Contradicts the documented boundary in AGENTS.md §4, which lists `nb-fs`'s allowed dependencies as std, hashing and `notify` only; also couples a filesystem-safety-critical, protected-path crate to git detection it doesn't need for its own job. |
| Allow `..` in `RepoPath` so an ancestor repository can be expressed | A format/schema change (AGENTS.md rule 3: needs a version increment, migration, fixtures and maintainer approval) for a case the spec's own wording ("relative to the project root") does not ask for; also weakens the `path` type's traversal protection (spec 6.5) for every other use of `RelativePath`-shaped fields, not just this one. |
| Fail the whole capture when the repository root is not expressible | FR-EVD-12 makes provenance conditional on the source being "in a repository" at all; a repository existing but not being usable for this one field is closer to that same condition than to a capture failure — the version itself (hash, size, placement) is still perfectly valid without provenance. |

## Consequences

- **A monorepo layout where the project folder sits inside a larger git repository records no provenance** for files captured from within it, even though `git log` on the real repository would show meaningful history. Acceptable per FR-EVD-12's own framing (Should, not Must, and explicitly conditional); revisit if this proves common in practice.
- **Tests.** `nb-git/src/lib.rs`'s inline unit tests and a proptest for `repo_relative_to_project` (same path, descendant, strict ancestor, unrelated), `nb-git/tests/provenance_in_project.rs` (the four scenarios against real temporary repositories), and `packages/format/src/notebook/capture.test.ts`/`capture.property.test.ts` (provenance recorded on a new artefact and an appended version, omitted when absent, and round-tripping through random capture sequences).
