# ADR-0034: VS Code extension design

- Status: Proposed
- Date: 2026-09-23
- Deciders: maintainer
- Spec sections affected: 7.10 (FR-VSC-01 to FR-VSC-07); gate S3-G05

## Context

S3-T06 builds `extensions/vscode`, empty until now: a command, "Research
Notebook: Add file to experiment", that finds the enclosing project
(FR-VSC-02), offers a quick pick of its experiments read through
`packages/format` (FR-VSC-03), asks for role and mode (FR-VSC-04), and
writes an inbox request (spec 5.10) atomically with git provenance recorded
through the VS Code Git API (FR-VSC-05), writing nothing else (FR-VSC-06).
The request format itself, its schema and serialiser already exist
(S2-T01/T02); the desktop-side import already exists (S3-T05). Unlike
S3-T01–T05, which were deliberately scoped "engine only" with no live
caller (ADR-0030 §4, ADR-0031 §5), this task's own definition of done is
the command itself, so — unusually for this stage — it has to actually run.

## Decision

1. **Decide/act split, same as every prior Stage 3 task.** Every file that
   imports `vscode` (`extension.ts`, `vscode-git.ts`) is a thin adapter;
   every decision (`project.ts`, `experiments.ts`, `git-provenance.ts`,
   `request.ts`, `write-request.ts`) is plain TypeScript with no `vscode`
   import, fully covered by vitest. This is what makes gate S3-G05
   ("Automated: Yes") possible without a real VS Code process.
2. **Bundled with esbuild, not just `tsc`-compiled.**
   `@research-notebook/format`'s `exports` points at `./src/index.ts` — fine
   for Vite and vitest, which transform on the fly, but a plain
   `tsc`-compiled entry point would still contain an unresolved
   `import "@research-notebook/format"` that Node cannot load at runtime.
   `esbuild src/extension.ts --bundle --platform=node --format=cjs
   --external:vscode --outfile=dist/bundle.js` produces one self-contained
   file; only `vscode` itself stays external, since the extension host
   supplies it. `package.json`'s `main` points at `dist/bundle.js`, a
   different name from anything `tsc -b`'s own `dist/*.js` output (used for
   typechecking and project references, unbundled, run by `pnpm typecheck`)
   writes — the two build steps share `dist/` (this package's `outDir`,
   like every other package's) without one overwriting the other.
3. **CommonJS output, not ESM.** VS Code's extension host loads `main` via
   `require`; `package.json` has no `"type": "module"`, so `dist/bundle.js`
   is interpreted as CommonJS, matching esbuild's `--format=cjs`. This is
   the same choice virtually every published VS Code extension makes, and
   the one VS Code's own extension generator defaults to.
4. **Git provenance: a plain interface, computed the same way `nb-git`
   already does, filled two different ways.** `git-provenance.ts` defines
   `RepositoryFacts` (a repository's root, `HEAD` commit, and its changed
   paths, each marked tracked or not) and `computeProvenance`, a direct
   port of `nb-git`'s `provenance_in_project` (`crates/nb-git/src/lib.rs`,
   ADR-0018, ADR-0032): `repo` expressed relative to the project root (`"."`
   or forward-slash, `null` when not expressible), `commit`, `path_in_repo`,
   `file_dirty` (the file itself changed, tracked or not — a brand new file
   is trivially dirty), `tree_dirty` (any *tracked* change anywhere in the
   repository, matching gix's `is_dirty()`, which the desktop app's capture
   already uses). In production, `vscode-git.ts` fills `RepositoryFacts`
   from VS Code's built-in Git extension API (FR-VSC-05's "through the VS
   Code Git API"). In tests, `git-integration.test.ts` fills the identical
   interface from direct `git` CLI calls against a real temporary
   repository — the same fixture-building technique
   `nb-git/tests/provenance.rs` already uses — and checks the result
   against what `git rev-parse`/`git status` independently report for that
   repository (gate S3-G05: "provenance commit and dirty flags correct in a
   test repository"). `vscode-git.ts` itself has no automated coverage,
   since nothing can run the live Git extension API outside a real VS Code
   process; it is flagged for closest review.
5. **`source.root` is always `"project"`.** FR-VSC-02 finds the project by
   walking *up* from the file being captured, so the file is always inside
   the project root or a descendant of it — the external-root case (spec
   5.8's other `source.root` value) only arises from the desktop app's own
   drag-and-drop or file picker, which can reach anywhere on disk. This
   extension never needs to resolve or even know about external roots.
6. **The ULID generator is duplicated, not shared.**
   `extensions/vscode/src/ulid.ts` is the same algorithm as
   `apps/desktop/src/shared/ulid.ts` (time plus 80 random bits, Crockford
   Base32, spec 5.2), adapted to Node's `crypto.randomBytes` instead of Web
   Crypto. `.dependency-cruiser.cjs`'s `extension-not-depend-on-app` rule
   forbids `extensions/` depending on `apps/` (AGENTS.md section 4); the
   algorithm is small, pure and already fully specified, so duplicating it
   is simpler and lower-risk than extracting a new shared package for one
   function two packages use.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Ship `tsc`-compiled output only, no bundler | Leaves the command literally unable to run: `dist/extension.js` would `require("@research-notebook/format")`, which resolves to a `.ts` source file Node cannot execute. Nothing else in this task's definition of done would work without this. |
| `@vscode/test-electron`, launching a real VS Code to test `vscode-git.ts` | Would cover the adapter itself, but is heavier (a new dependency, a downloaded VS Code binary, slower CI) than gate S3-G05's own "Automated: Yes" `pnpm test:vscode` wording implies, and the pure `computeProvenance` logic — where the actual `file_dirty`/`tree_dirty`/`repo` decisions live — is already fully covered without it. |
| Shell out to `git` in production, matching `nb-git`'s own CLI-or-gix choice (S1-T09) | FR-VSC-05 explicitly asks for provenance "through the VS Code Git API", not the CLI; shelling out would also duplicate work the Git extension the user already has open is doing, and can behave differently from what VS Code itself shows (e.g. a different `git` on `PATH`). |
| Extract `ulid.ts` into a new shared package (or move it into `packages/format`) | A bigger, cross-cutting change (a new package, or altering what `packages/format` is for) to de-duplicate under 60 lines of already-specified, already-tested logic; out of scope for a task about the VS Code extension. |

## Consequences

- **The bundle is roughly 1 MB**, since it inlines `zod` and
  `@research-notebook/format`. Acceptable for a devDependency-time build
  artefact of an extension that does one thing; nothing in this task's gate
  or the spec sets a size budget for it.
- **`vscode-git.ts`'s one unverifiable constant.** `UNTRACKED_STATUS = 7`
  (the Git extension's own `Status.UNTRACKED`) is taken from that enum's
  documented declaration order, not confirmed against an installed VS
  Code's own copy of `git.d.ts` — flagged in the file itself and here for a
  maintainer to check before relying on `tree_dirty` in production.
- **Multi-select in the Explorer is not handled.** The command reads only
  the clicked resource, matching the spec's singular "Add file to
  experiment" wording; selecting several files and invoking the command
  once captures only the first.
- **Tests.** `extensions/vscode/src/project.test.ts`,
  `experiments.test.ts`, `git-provenance.test.ts`, `request.test.ts`,
  `write-request.test.ts`, `ulid.test.ts` (all pure logic, real temporary
  directories, no `vscode` import) and `git-integration.test.ts` (gate
  S3-G05, a real temporary git repository built and independently checked
  with the `git` CLI).
