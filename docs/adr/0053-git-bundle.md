# ADR-0053: Git bundles are an optional, verified export of committed history

- Status: Proposed
- Date: 2026-10-05
- Deciders: maintainer
- Spec sections affected: 7.12 (FR-ARC-04), 6.1

## Context

S6-T04 writes "a git bundle of each repository referenced by provenance"
(FR-ARC-04, Should). A version captured from inside a repository records its
`repo`, `commit`, `path_in_repo` and dirty flags (spec 5.8, ADR-0032). The
spec does not say where bundles go, what a bundle contains, how it is made
given ADR-0018, or how it is written given that only `nb-fs` writes.

## Decision

1. **Not a format change.** Bundles are derived exports under
   `_notebook/exports/git/`, like the manifest (ADR-0051 §1). Nothing in
   `artefacts.yaml` changes, so there is no version increment or migration.
2. **Which repositories.** `packages/format` (`gitRepositories`) lists the
   distinct `provenance.repo` values of captured versions, sorted. Linked
   artefacts record no provenance (spec 5.8) and contribute nothing. Rust
   is given paths and never reads `artefacts.yaml` (AGENTS.md §2.2).
3. **Only inside the project.** ADR-0032 means `repo` is `.` or a forward-only
   path below the project root, so a repository outside the project cannot
   be referenced. A path that is not of that form, or a link that resolves
   outside the project, is refused (`refused`), not followed.
4. **The `git` program.** `gix` cannot write bundles, so `nb-git` runs
   `git -C <repo> bundle create <file> --all`, then `git bundle verify`
   (ADR-0018 kept the CLI for this). It is the only place git is run, with
   fixed arguments, no stdin, no terminal prompts and no console window on
   Windows. The `\\?\` prefix of Windows canonical paths is dropped because
   git rejects it. If `git` cannot be started the answer is `gitMissing`; no
   fallback bundle writer is attempted.
5. **What a bundle holds.** `--all`: every branch, tag and HEAD, with full
   history, because a bundle of only the cited commits would still need their
   ancestors. It holds **committed** history only. A version captured with
   `file_dirty` or `tree_dirty` set came from code that no commit contains, and
   a bundle cannot restore it; the panel says so. The repository is only read.
6. **How it is written.** `ProjectRoot::write_via_temp` in `nb-fs` creates the
   temporary file inside `exports/git/` (confined, `.name.pid.n.tmp`), `nb-git`
   fills and verifies it, and only then is it renamed over the destination.
   A failure removes the temporary file and keeps any earlier bundle, so a bad
   run never replaces a good bundle with a bad one.
7. **Names.** `<slug>.bundle`, where the slug is the repository path with `/`
   as `-`, unsafe characters as `_` and `.` (the project folder) as `root`;
   two repositories that would share a name get `-2`, `-3`. The commit is
   deliberately not in the name: a name that changes with HEAD would leave
   every earlier bundle behind, and the application never deletes
   (`nb-fs` only moves to the trash). A re-run replaces the file, as the
   manifest does, and the bundle's own refs record the commit.
8. **Per repository.** Each repository has its own verdict (`written`,
   `gitMissing`, `notARepository`, `noCommits`, `refused`, `failed`,
   `writeFailed`), answered by position. One that cannot be bundled does not
   stop the others. Verdicts carry no text from git, which can name paths the
   person did not ask about.
9. **Optional and locked.** Nothing writes a bundle unless the person asks. The
   command needs the project lock, so a read-only project cannot write them.
10. **Size.** Bundles can be large. The panel says so beforehand and shows the
    size afterwards; there is no estimate before writing.
11. **Not part of Verify.** Bundles are not captured files and are not in
    `manifest.csv`, so Verify neither lists nor checks them. Git verifies them
    when they are made.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Write the bundle with `gix` | `gix` has no bundle writer; writing one by hand is far larger than the feature. |
| Bundle only the cited commits | Needs their ancestors anyway, and omits branches a reader may want. |
| Name files by HEAD commit | Leaves stale bundles after every re-run, which the application cannot delete. |
| Write the bundle straight to the destination | A failed run would replace a good bundle with a partial one. |
| Hand git a temporary file in the system temp folder | The final move may cross volumes and would need a copy; `nb-fs` creating the file beside the destination keeps one volume and one confinement check. |

## Consequences

- **Runtime dependency.** Bundles need `git` on the PATH. Everything else in
  the application works without it. No new crate is added; `nb-archive` now
  depends on `nb-git`.
- **Tests.** `nb-git/tests/bundle.rs` (clone round trip, all branches, source
  unchanged, not a repo, not the root, no commits, git missing),
  `nb-fs/tests/write_via_temp.rs` (placement, confinement, failure keeps the
  old file), `nb-archive/tests/git_bundle.rs` (one bundle each, partial
  failure, refused paths, name collisions, replacement, nothing else
  changes), command tests in `commands/projects/git_bundle.rs`,
  `gitRepositories.test.ts`, `gitBundle.test.ts`, `GitBundlePanel.test.tsx`.
- **Protected paths.** `crates/nb-fs/`, `crates/nb-archive/` and this ADR.
- **Not tested.** Submodules, worktrees, shallow clones, repositories using
  alternates, and `safe.directory` refusals (reported as `failed`). A
  repository larger than memory is not a concern, since git streams to disk.
- **Windows only.** Everything here was run on Windows with git 2.54.
