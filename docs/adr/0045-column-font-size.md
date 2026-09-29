# ADR-0045: Per-column font size in the workspace table

- Status: Proposed
- Date: 2026-09-29
- Deciders: maintainer
- Spec sections affected: 5.3 (`table.columns`); format-v1.md 4.1

## Context

Interpretation and Literature summaries can run to several paragraphs, longer than Methods or Results Notes typically do. A UI pass (issue #64 follow-up) already gives those two columns a smaller default size and a taller clamp in CSS. The maintainer also asked for the size to be adjustable per column, not fixed, and for it to be shared with anyone else opening the project rather than a private display setting.

`project.yaml`'s `table.columns[]` already holds `width` and `hidden` per column (ADR-0027), added without a `format_version` bump because they are additive: a project written before they existed simply has neither, and the application supplies a default. `format_version` is a single hardcoded literal in this codebase (`packages/format/src/schema/common.ts`) — no migration mechanism has ever been built, because no field has ever needed one. Building one now, for a font size, would be a large piece of infrastructure unrelated to the feature.

## Decision

Add `table.columns[].fontSize` (CSS pixels, a positive integer) to the schema as an **optional** field, on the same footing as `width` and `hidden` before it: no `format_version` bump, no migration. A column with no `fontSize` renders at the application's CSS default (including the existing interpretation/literature special case); setting one overrides it. `changeTableSettings` gains a `fontSize` change alongside `widths` and `hidden`, written in the same snapshot. "Reset columns" clears any chosen font size back to the default, the same as it already resets width and visibility.

The UI control lives in the existing columns menu (`ColumnsMenu.tsx`, next to each column's width field), not a new panel: it is the same kind of per-column layout setting, adjusted the same way.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Bump `format_version` and build a migration | The first migration mechanism this codebase would ever need, for one optional field. A much larger, separate piece of work than the feature itself. |
| Store it in application settings, per machine (like external-root paths) | Explicitly not what was asked for: the maintainer wants it shared with anyone opening the project, not private per computer. |
| A single project-wide font size, not per column | Doesn't fit the reason it was asked for: interpretation and literature specifically need a different size from the rest. |

## Consequences

- **Existing projects need no migration and no fixture changes.** All four fixtures under `fixtures/projects/format-v1/` already list explicit `width`/`hidden` for every column; none declare `fontSize`, and none needed to — confirmed by `pnpm test:fixtures`.
- **The JSON Schema exports and format-v1.md must stay in sync**, as for any schema change (`pnpm schemas:export`; the `columns[].fontSize` key documented in format-v1.md's field table).
- **Tests**: `packages/format` — schema acceptance/rejection cases, a property-test arbitrary that generates the field present and absent, and `table-settings.test.ts` covering set, validate, and reset-clears. `apps/desktop` — the column-layout model (`columns.test.ts`) and the `ColumnsMenu` field.
- **A future true migration system**, if another format change needs one, is still unbuilt; this ADR does not attempt to design it.
