# ADR-0059: Result classification

- Status: Proposed
- Date: 2026-10-10
- Deciders: maintainer
- Spec sections affected: 5.8 (`artefacts[]`), 5.13 (rule 1), 7.5; issue #101 (sections 5.8 and 5.9)

## Context

Issue #101 asks for results to be marked as main figures, supplementary figures, intermediate outputs or quality control, and for that label to be independent of the groups that hold the result. Groups are virtual and user-named (ADR-0036), so a group called "Main figures" must not decide what a result is. The label has to survive reopening and export, so it belongs in `artefacts.yaml`. That is a change to spec chapter 5.

Spec 5.13 rule 1 says every change to chapter 5 increments `format_version`. Opening a project in an older format is not wired into the application: `MIGRATIONS` is empty, `packages/format/migrations/` does not exist, and ADR-0058 point 5 left the runner for the first real step.

## Decision

1. **One optional key, `artefacts[].classification`,** a lower-case slug (`^[a-z][a-z0-9_]{0,39}$`). Absent means unclassified. It is meaningful for `role: result` only; `setClassification` refuses a method.
2. **Known values are `main_figure`, `supplementary_figure`, `intermediate_output`, `quality_control` and `general`.** The schema accepts any slug, not only these, so the set is extensible and a file written by a later build is read, kept and written back unchanged by this one.
3. **Independent of groups.** Moving a result between groups never changes it, and putting a result in a group named "Main figures" does not set it. `setClassification` changes that one key and nothing else, like the group operations.
4. **`format_version` stays 1.** The key is additive and optional. Every schema is a loose object, so a build without this change preserves the key as unknown content (ADR-0019), and a file without it reads exactly as before. The maintainer chose this over a version 2 with a migration, because the opening-time migration flow (backup, confirmation, runner) does not exist yet and would be much larger than the field. This amends spec 5.13 rule 1 to: a change that only adds an optional key to an existing object, and that older builds preserve unchanged, does not need a new `format_version`. Any other change to chapter 5 still does.
5. **No new fixture folder under `fixtures/projects/format-v1/`** (released fixtures are immutable). A file with no `classification` is covered by the existing fixtures, and a file with it by unit and property tests (`classification.test.ts`, and the artefacts round-trip arbitrary now draws the key).

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Version 2 with a migration | Correct by the letter of 5.13, but needs the unbuilt open-time migration flow. The change is a single optional key older builds already keep. |
| A boolean `is_main_figure` | The issue lists four classifications and asks for extensibility. |
| A closed enum in the schema | A later build adding a value would make older builds refuse the whole file. |
| Derive the label from group names | Couples the meaning of a result to a user-chosen name, which the issue rules out. |

## Consequences

- Spec 5.13 rule 1 and `docs/format/format-v1.md` section 4.4 are updated in the same change, and `artefacts.schema.json` is regenerated.
- A build older than this one shows no label but loses nothing: the key is written back unchanged.
- The next change to chapter 5 that is not purely additive still has to build the version 2 path.
