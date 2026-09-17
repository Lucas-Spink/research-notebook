# Git workflow

## Branches

- Stage 0 tasks share the existing `stage-0/tooling` branch.
- Every other task gets its own branch named `s<stage>/t<nn>-short-description`,
  for example `s2/t04-atomic-writes`.
- Stage 1 spikes use `spike/<description>`; spike code may be discarded once
  its ADR is written.
- Branch from an up-to-date `main` (`git pull` first) unless the task
  explicitly reuses an existing branch.

## Commits

Conventional Commits, scoped to the package or area changed, ending with the
task ID:

```
type(scope): description (S2-T04)
```

For example: `fix(nb-fs): retry rename on Windows sharing violation (S2-T04)`.
Common types: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`. Commit in
small steps so each commit is reviewable on its own.

## Pull requests

- One task or concern per pull request; aim for under 400 changed lines
  excluding generated files and fixtures.
- Fill in the [pull request template](../.github/pull_request_template.md)
  completely, including what was not tested.
- Flag any protected path from AGENTS.md section 6 for maintainer review.
- Do not push, open or merge a pull request without being asked to.

See [`AGENTS.md`](../AGENTS.md) for the full set of rules this workflow
serves, and [`docs/testing-guide.md`](testing-guide.md) for what to test
before opening a pull request.
