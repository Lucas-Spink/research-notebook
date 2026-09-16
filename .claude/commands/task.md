---
description: Start a workbook task by ID, for example /task S2-T04
argument-hint: <task ID, for example S2-T04>
---

Start task $ARGUMENTS.

## 1. Load context

1. Read `docs/planning/stages.md`. Find the row for $ARGUMENTS, its stage, the stage's other tasks and the stage's gate tests. If the ID does not exist, stop and say so.
2. Read the spec sections in the task's Spec column from `docs/spec/specification.md`, plus any ADRs in `docs/adr/` they relate to.
3. If the task involves tests, read `docs/testing-guide.md`.
4. Find what is already done: `git log --oneline main` (commit messages end with task IDs) and the files the task concerns.

## 2. Check scope and branch

- Only this task is in scope. Other tasks in the stage are out of scope unless already merged. If this task cannot be done without one of them, stop and tell me.
- Follow the Agent notes column for this task exactly.
- Run `git branch --show-current` and `git status --short`.
  - On `main` with a clean working tree: `git pull`, then create `s<stage>/t<nn>-short-description` (for example `s2/t04-atomic-writes`). Stage 0 tasks use the existing `stage-0/tooling` branch and Stage 1 spikes use `spike/<description>`.
  - On `main` with uncommitted changes: stop and ask me.
  - On another branch: tell me which branch you are on and confirm it matches this task before continuing.

## 3. Plan and wait for approval

Present, then stop and wait for my approval:

1. The definition of done restated as a checklist.
2. Files you will create or change.
3. Tests you will write first, and why each will fail before implementation.
4. Gate tests from this stage that the task affects.
5. Protected paths touched (AGENTS.md section 6), and whether the task is marked Human review.
6. New dependencies needed, with the AGENTS.md section 7 checklist.
7. Ambiguities or questions. Ask them now; do not guess on anything that affects project files or data.

## 4. Implement after approval

- Write the tests first and run them to confirm they fail for the right reason.
- Implement the smallest change that makes them pass.
- Run `pnpm check` plus the suites for the areas you touched.
- Commit in small steps. Every message follows `type(scope): description ($ARGUMENTS)`.
- Do not push, open a pull request or merge.

## 5. Report

Finish with:

1. The definition of done checklist, each item marked met or not met with evidence.
2. Every command you ran and its result.
3. Affected gate tests and whether they now pass.
4. Anything not done, not tested, or tested on one platform only.
5. The parts of the diff I should review most closely.
6. A suggested pull request title and description following `.github/pull_request_template.md`.
