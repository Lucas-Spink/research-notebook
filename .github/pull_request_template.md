## What and why

Task ID(s):
Spec sections:
ADRs:

## Plan and scope

<!-- Files changed, approach, anything deliberately left out. -->

## How it was tested

<!-- Suites run locally, new tests added, manual checks and on which platform. -->

## Checklist

- [ ] Tests for new invariants written first; bug fixes include a regression test that failed before the fix
- [ ] `pnpm check` passes locally, plus suites for the areas touched
- [ ] No tests skipped, deleted, weakened or given fewer property cases
- [ ] Golden files unchanged, or `pnpm golden:update` diff explained below
- [ ] No new dependencies, or the AGENTS.md dependency checklist is completed below
- [ ] No protected paths changed, or they are listed below for maintainer review
- [ ] No writes outside `_notebook/`; no new network access
- [ ] Documentation and specification updated; ADR added if a decision changed
- [ ] User-facing text in British English, in message files

## Protected paths touched

## New dependencies

## AI assistance

Tool and model:
Parts that need the closest human review:
