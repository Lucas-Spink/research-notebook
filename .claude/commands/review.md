---
description: Review the current branch against the project rules before opening a pull request
---

Review every change on the current branch compared with `main`. Do not modify any file.

Use `git log --oneline main..HEAD`, `git diff main...HEAD --stat` and `git diff main...HEAD`. Read `AGENTS.md` and the task rows in `docs/planning/stages.md` for the task IDs in the commit messages.

Report under these headings, citing file and line for every finding:

1. **Definition of done:** for each task ID, whether every item is met.
2. **Non-negotiable rules:** any breach of AGENTS.md section 2, especially writes outside `_notebook/`, parsing outside `packages/format`, format changes, weakened or skipped tests, network access, and direct filesystem access from the webview.
3. **Protected paths:** every changed file under AGENTS.md section 6.
4. **Tests:** new behaviour without tests; invariants without property tests; bug fixes without regression tests; skipped, deleted or loosened tests; reduced case counts; golden file changes and whether they are justified.
5. **Dependencies:** new packages or crates, their licences, and whether the checklist is satisfied.
6. **Code standards:** AGENTS.md section 5 issues such as `any`, unchecked casts, `!` assertions, `unwrap`, inline user-facing strings, oversized files or functions, untracked TODOs, commented-out code.
7. **Architecture:** imports that cross the boundaries in AGENTS.md section 4.
8. **Documentation:** spec, format document, ADR or testing guide updates the change requires but lacks.
9. **Verdict:** Ready for pull request, or Needs changes with a prioritised list (blocking first).
