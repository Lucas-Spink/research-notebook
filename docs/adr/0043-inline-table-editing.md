# ADR-0043: Edit sections, title and status inline in the workspace table

- Status: Accepted
- Date: 2026-09-26
- Deciders: maintainer
- Spec sections affected: 4.3 (column table), 7.3 (FR-TBL-05, FR-TBL-11, FR-TBL-12), 7.7 (FR-EDT-03), 15.1; gates S4-G08, S4-G11, S4-G12

## Context

ADR-0005 made every table cell a read-only summary and put the one live
editor in the expanded view. It gave two reasons: rich editors inside
virtualised grid cells conflict with row measurement, and they conflict with
keyboard handling.

The S4-T10 internal alpha showed the cost of that choice. To change one
sentence of Methods, the maintainer selects a row, scrolls past the whole
table to the details panel, and edits there. The maintainer judged the app
not worth using without editing in the table.

Neither of ADR-0005's reasons forbids table editing outright. Each has a
narrower answer:

- **Row measurement.** The table uses fixed row heights (ADR-0027) so
  scrolling never measures anything. Only the row being edited needs a
  variable height, and `@tanstack/virtual-core` 3.17.11 (installed) can
  measure a single element (`measureElement`), reset one size
  (`resizeItem`), and keep a given index rendered (`rangeExtractor`).
- **Keyboard handling.** The conflict is between arrow keys that move
  around the grid and arrow keys that move the caret. A grid that ignores
  navigation keys whose target is inside an editor, `input` or `select`
  removes it.

Nothing about the files changes. Sections are still parsed and serialised
only by `parseSectionMarkdown` and `serialiseSectionMarkdown`, and title
and status only by `editExperiment`. All of these live in `packages/format`.

## Decision

This ADR supersedes ADR-0005.

1. **Editable cells.** The Methods, Results Notes and Interpretation cells,
   and the experiment's title and status, can be edited in place in the
   workspace table. Literature stays read-only because it is generated.
   Results stays as it is.
2. **One live editor for the application.** At most one rich editor
   (`.ProseMirror`) is mounted anywhere at a time, whether in the table or in
   the details panel. One live-editor target is held above the table in
   `NotebookView`, together with the single autosave for that target.
   Switching target saves pending text before the next editor mounts. The
   plain `input` and `select` used for title and status share the same
   target but are not rich editors.
3. **Growing row.** The row being edited is the only row that is measured.
   It grows to fit the editor, up to a cap after which the editor scrolls
   inside. It returns to the fixed height when editing ends. Every other row
   keeps the fixed heights from ADR-0027.
4. **Pinned row.** The row being edited is always rendered, even when
   scrolled out of view, so an editor is never unmounted by virtualisation.
5. **Keyboard grid.** The table becomes an ARIA `grid`:
   - A roving tab stop moves over editable cells, and arrow keys move it.
   - Enter or F2 starts editing.
   - Escape saves, leaves the editor and returns focus to the cell.
   - Navigation keys whose target is inside an editor, `input` or `select`
     are left to that control.
6. **Same save path.** Table edits call the same actions as the expanded
   view, `editExperimentSection` and `editExperiment`. Reference rewriting
   (FR-EDT-09), detached references (FR-EDT-08) and the hash-checked write
   are therefore unchanged.
7. **Read-only.** A cell never enters editing when the project is read-only
   for any reason (spec 5.11) or when the experiment's file failed to parse
   (AGENTS.md rule 5).
8. **Width.** Section columns share any spare width in proportion to their
   stored widths. Widths in `project.yaml` remain the stored minimums.

The details panel keeps its section editors (FR-TBL-07) as a roomier view
for long writing. It shares the single live editor from point 2.

This ADR overrides these parts of earlier ADRs:

- ADR-0016: its confirmation of "read-only cells".
- ADR-0027: line 31 (every row fixed height) for the edited row, and line
  69 (cell editor rejected).
- ADR-0028: the reading that the one live editor is confined to the
  expanded view.
- ADR-0040: `ExpandedExperimentView` as the sole owner of the live section.

## Alternatives considered

| Option | Why not chosen |
| --- | --- |
| Keep read-only cells; move the details panel beside the table | Removes the scrolling but still edits away from the cell; the maintainer judged this not enough. |
| Editor floats over the cell with fixed row heights | No measurement needed, but the editor covers neighbouring rows while editing; the maintainer preferred a growing row. |
| Switch to AG Grid Community | Question header rows need Enterprise row grouping or unproven full-width-row work, plus a table rewrite and a large new dependency. |
| Switch to glide-data-grid | Stable release supports React 18 only (React 19 needs an alpha); canvas cells cannot host artefact-reference chips; its `marked` peer would be a second Markdown parser (AGENTS.md rule 2). |
| Remove section editors from the details panel | Less code, but long texts would be edited only at column width. |

## Consequences

**Easier:**

- Quick edits happen where the text is shown.
- A switch between editors now always saves first. Before, it relied on
  blur or the one-second debounce.

**Harder:**

- The table needs keyboard grid logic and one measured row.
- Portals are needed for the reference preview overlay and chip tooltip.
  Table rows are positioned with `transform`, which would otherwise pin
  fixed overlays to the row and clip tooltips.

**Tests and gates:**

- S4-G08 counts editors across the table and the details panel.
- New S4-G11: a table edit writes the same bytes as the expanded view.
- New S4-G12: scrolling the 500-row table with an editor open has no frame
  over 50 ms, profiled on each platform (as S1-G08 and NFR-PERF-03).
- The table's ARIA role assertions change from `table` to `grid`.

**Documents:**

- Spec 4.3, 7.3, 7.7 and 15.1.
- `docs/planning/stages.md` and the workbook: task S4-T11 and the gates
  above.
- ADR-0005 is marked superseded.

**Not covered:** there is no automated accessibility tooling in the
frontend. Adding axe-core is a dependency decision for a later task.
