# Contributing

Thank you for your interest in the Computational Research Notebook.

## Rules first

[`AGENTS.md`](AGENTS.md) is the binding rules document for every contributor,
human or AI. Read it completely before making a change: it covers what the
project is, when to stop and ask instead of guessing, architecture
boundaries, code standards, protected paths and the dependency checklist.
[`CLAUDE.md`](CLAUDE.md) adds Claude Code specifics on top of it.

## Workflow

Branch naming, commit message format and pull request expectations are in
[`docs/git-workflow.md`](docs/git-workflow.md).

Every task follows the workflow in AGENTS.md section 3: identify the task
and its gate tests, ask if the spec is ambiguous, write a short plan, write
tests first for any invariant, implement the smallest slice that passes,
then run the checks below.

## Before opening a pull request

```sh
pnpm check
```

plus the specific suites named in the task's gate tests (see
[`docs/testing-guide.md`](docs/testing-guide.md) and the commands table in
AGENTS.md section 9). Fill in the
[pull request template](.github/pull_request_template.md) completely.

## Getting help

If a task cannot be completed within the rules in AGENTS.md — an ambiguous
spec, a needed format change, a protected path outside the task's scope — stop
and ask rather than guessing.
