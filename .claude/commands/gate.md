---
description: Run a stage's gate tests and produce results for the workbook, for example /gate 2
argument-hint: <stage number>
---

Run the gate tests for Stage $ARGUMENTS listed in `docs/planning/stages.md`.

Rules:

- Do not change code, tests, configuration or fixtures to make a test pass. If a test fails, report it and stop working on that test.
- State this machine's operating system. Tests marked Both also need a CI run on the other platform before they count as Pass.
- Negative tests (for example "lint violation fails CI") must be demonstrated on a temporary branch named `gate/s$ARGUMENTS-negative`, never on the task branch or `main`. Delete that branch afterwards.

For each gate test:

1. Automated Yes: run the command and record pass or fail with the key output lines.
2. Automated Partly: run the automated part and list the manual steps that remain.
3. Automated No: write a short numbered checklist for me to perform.
4. Tests whose trigger is Nightly or Release: say whether the latest workflow run passed (`gh run list --workflow nightly.yml --limit 3`), if `gh` is available.

Finish with a table I can copy into the workbook:

| Test ID | Result (Pass, Fail, Manual needed, Needs other platform, Cannot run here) | Evidence | Notes |

Then list, in order, what must happen before the Stage $ARGUMENTS gate can be marked passed.
