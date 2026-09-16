# Research Notebook starter kit

Files to copy into the root of the new repository during Stage 0. They set the rules for AI agents and wire up automated testing before any feature code exists.

| File | Purpose |
| --- | --- |
| `AGENTS.md` | Rules every AI agent follows; read by Codex, Cursor, Copilot and others |
| `CLAUDE.md` | Imports `AGENTS.md` for Claude Code and adds Claude-specific instructions |
| `package.json` | Test and check scripts used by the workbook, CI and agents |
| `vitest.config.ts` | Vitest projects: unit, ui, property, golden, fixtures |
| `stryker.config.json` | Mutation testing for the format and citation packages |
| `.dependency-cruiser.cjs` | Architecture boundary rules (spec 6.3) |
| `clippy.toml` | Forbids direct filesystem and process calls outside approved crates |
| `deny.toml` | Rust licence allow-list and advisory checks |
| `.gitignore` | Repository ignore rules for build output, test reports, secrets and OS clutter |
| `templates/research-project.gitignore` | Template for research project folders the app manages |
| `lefthook.yml` | Pre-commit and pre-push hooks |
| `scripts/check-no-skipped-tests.mjs` | Blocks `.only`, `.skip` and `xit` |
| `.github/workflows/ci.yml` | Required pull-request checks on Windows and macOS |
| `.github/workflows/nightly.yml` | Long property runs, end-to-end, cross-OS handoff, PDF/A, benchmarks |
| `.github/workflows/weekly.yml` | Mutation testing and advisories |
| `.github/pull_request_template.md` | Checklist enforcing the agent rules |
| `.github/CODEOWNERS` | Maintainer review for protected paths |
| `docs/testing-guide.md` | Test patterns and examples |
| `docs/adr/` | ADR template and the eight initial decisions |

## Stage 0 steps

1. Create the repository and copy these files in. Replace `@OWNER` in `CODEOWNERS`.
2. Set `packageManager` in `package.json` to the current pnpm release and confirm `.nvmrc` matches the current Node LTS.
3. Install development dependencies with exact versions: `typescript`, `vitest`, `jsdom`, `fast-check`, `@testing-library/react`, `eslint`, `typescript-eslint`, `prettier`, `dependency-cruiser`, `license-checker-rseidelsohn`, `lefthook`, `@stryker-mutator/core`, `@stryker-mutator/vitest-runner`, `vitest-axe`.
4. Run `pnpm lefthook install`.
5. Add workspace lints to `apps/desktop/src-tauri/Cargo.toml`:

```toml
[workspace.lints.rust]
unsafe_code = "forbid"

[workspace.lints.clippy]
unwrap_used = "deny"
expect_used = "deny"
panic = "deny"
print_stdout = "deny"
dbg_macro = "deny"
todo = "deny"
```

   Each crate then adds `[lints] workspace = true`. Allow `unwrap_used` and `expect_used` in test modules with `#[cfg_attr(test, allow(clippy::unwrap_used, clippy::expect_used))]`.

6. Add ESLint restricted imports mirroring the dependency-cruiser rules, plus `@typescript-eslint/no-explicit-any`, `@typescript-eslint/no-non-null-assertion` and `@typescript-eslint/switch-exhaustiveness-check` as errors.
7. Commit a placeholder test in each suite so every CI step runs, then enable branch protection on `main` requiring the `Checks (windows-latest)`, `Checks (macos-latest)`, `Pandoc recovery command` and `Licences and advisories` jobs.
8. Run the Stage 0 gate tests in the workbook, including the deliberate negative tests.

## Items to confirm when Stage 0 starts

These reference tools whose options change over time. Check each against current documentation before relying on it:

- GitHub Action major versions in the workflows.
- `license-checker-rseidelsohn` flags, and the licence field of `citeproc`.
- The veraPDF Docker image name and CLI flags.
- Vitest `projects` configuration and `--outputJson` for benchmarks.
- StrykerJS Vitest runner support for Vitest projects.

Scripts referenced but not yet written (`handoff.mjs`, `generate-large-fixture.mjs`, the `nb-export` example, the fs safety test) are created in the stages listed in the workbook. Until then their CI steps are expected to fail, so add them to branch protection only once they exist.
