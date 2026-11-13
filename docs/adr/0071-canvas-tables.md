# ADR-0071: Tables of figures on the canvas (canvas format version 3)

- Status: Proposed
- Date: 2026-11-13
- Deciders: maintainer
- Spec sections affected: 5.13 (canvas files); 7.12 (canvas); format-v1.md 4.9
- Amends: ADR-0064 point 4 (versions), ADR-0065 (lines)

## Context

Repeats of one result (replicates, conditions, versions of one figure) are hard to compare as loose cards. A table with row and column headings, a figure in each cell, and notes that can point at a cell would organise them. A table is a new kind of canvas node, which the closed node union in `schema/canvas.ts` rejects, so this is an on-disk format change (AGENTS.md rule 3).

## Decision

1. **A new node type `table`**: `rows` and `columns` (each `{id, label}`, ids unique within the table, so a heading can be renamed or moved without disturbing the cells that name it), `cells` (at most one figure per row and column: `{row, column, experiment_id, artefact_id, version?, aspect?}`, a reference as an `artefact` node is, never a copy), `fit` (`row` or `column`: whether the cells of each row, or each column, take the shape of their largest figure), `position` and `size`. `aspect` is the picture's width over its height once known, so a table lays out the same on reopening.
2. **A line may end at one cell**: an edge gains optional `source_cell` and `target_cell` (`{row, column}`). The node at that end must be a table that has that row and column. The existing `source_handle` and `target_handle` still say which side of the table the line is drawn at.
3. **Version policy.** The canvas version is 3 **only when the canvas holds a table or a line to a cell**; every other canvas is written at version 2. Reading accepts 2 and 3; 4 and above is `unsupported-version`; 1 stays a schema error. `serialiseCanvas` sets the version from the content (`canvasVersionFor`), so it cannot be written wrongly, and a canvas whose last table is removed goes back to 2. A table or a cell line in a version 2 file is a schema error.
4. **Only canvases with tables are affected in older builds.** A build that knows only version 2 reads every canvas without a table as before and shows one with a table as unreadable: read-only and untouched (ADR-0064 point 7). Project, question, experiment and artefact files do not change version.
5. **No migration step.** A version 2 canvas is already valid at version 3 and nothing rewrites it; a canvas becomes version 3 only when a person adds a table. AGENTS.md rule 3 asks for a migration with a version increment: this ADR records why none is needed, and the maintainer decides whether that satisfies the rule.
6. **Presentation only.** Like the rest of the canvas, tables are excluded from machine export and verification (ADR-0064 point 6). A cell that names a result which no longer exists is shown as missing and not rewritten (format-v1.md section 5).
7. **Until the table card exists** (a later change), the application keeps a table in the file as it is and does not draw it. Nothing in the application creates one yet.
8. **Fixtures.** A new fixture `canvas-tables` is added (the released `canvases` fixture is immutable): a version 3 canvas with a table (filled, empty and missing cells) and a cell line, and a canvas with none at version 2. `docs/format/format-v1.md` 4.9 and `canvas.schema.json` are updated.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Arrange ordinary figure nodes into a grid with no format change | Rows and columns would not be real objects, so adding or removing one, naming headings and dropping a figure into a cell could not be kept. |
| Bump every canvas to version 3 | Would make every existing canvas unreadable in older builds for a feature most canvases do not use. |
| Store table cells as `artefact` nodes with a `table` and `cell` key | Mixes layout the table owns into nodes the canvas lays out, and leaves headings nowhere to live. |
| Keep the version at 2 and let older builds reject the unknown node type | Older builds would reject the whole canvas for a reason their version number does not give, which is what the version number is for. |

## Consequences

- One more node type in every place that switches over nodes (`assertNever` makes each one a compile error until handled); this change adds only the format and the do-not-draw case.
- A canvas file with a table cannot be opened for editing by 0.1.4 or earlier.
- Cell lines are checked in the schema, so removing a row or column must also remove the lines that end at its cells (the model's job, tested with the table editing).
- The property tests generate tables and check the round trip and the version; lines to cells are covered by example tests and the fixture.
