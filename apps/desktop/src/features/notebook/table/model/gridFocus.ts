import { assertNever } from "../../../../shared/assertNever";
import type { TableRow } from "./rows";

/**
 * The one cell of the grid that holds keyboard focus (ADR-0043 point 5): a
 * row by its key, so sorting keeps it, and a column by its place among the
 * shown columns, where 0 is the Experiment column.
 */
export type GridCell = { rowKey: string; col: number };

export type GridKey =
  "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

const GRID_KEYS: readonly GridKey[] = [
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
];

/** Whether `key` moves focus around the grid. */
export function isGridKey(key: string): key is GridKey {
  return GRID_KEYS.some((known) => known === key);
}

const isExperiment = (row: TableRow | undefined) => row?.kind === "experiment";

/** The next experiment row from `index` in `step`'s direction, or `index` itself at the end. */
function nextExperiment(
  rows: readonly TableRow[],
  index: number,
  step: 1 | -1,
): number {
  for (let i = index + step; i >= 0 && i < rows.length; i += step) {
    if (isExperiment(rows[i])) return i;
  }
  return index;
}

/**
 * `cell` if it is still shown, with its column pulled in if columns were
 * hidden; otherwise the first experiment's first cell. `null` when no
 * experiment is shown at all.
 */
export function settleCell(
  rows: readonly TableRow[],
  colCount: number,
  cell: GridCell | null,
): GridCell | null {
  const kept =
    cell === null
      ? undefined
      : rows.find((row) => row.key === cell.rowKey && isExperiment(row));
  if (kept !== undefined && cell !== null) {
    return { rowKey: kept.key, col: Math.min(cell.col, colCount - 1) };
  }
  const first = rows.find(isExperiment);
  return first === undefined ? null : { rowKey: first.key, col: 0 };
}

/**
 * Where `key` moves focus from `cell`: up and down between experiment rows,
 * passing over question headers and "no matches" rows; left and right within
 * the row; Home and End to its ends. Focus stays put at every edge.
 */
export function moveCell(
  rows: readonly TableRow[],
  colCount: number,
  cell: GridCell,
  key: GridKey,
): GridCell {
  const index = rows.findIndex((row) => row.key === cell.rowKey);
  const last = colCount - 1;
  switch (key) {
    case "ArrowUp":
    case "ArrowDown": {
      const to = nextExperiment(rows, index, key === "ArrowUp" ? -1 : 1);
      return { rowKey: rows[to]?.key ?? cell.rowKey, col: cell.col };
    }
    case "ArrowLeft":
      return { ...cell, col: Math.max(cell.col - 1, 0) };
    case "ArrowRight":
      return { ...cell, col: Math.min(cell.col + 1, last) };
    case "Home":
      return { ...cell, col: 0 };
    case "End":
      return { ...cell, col: last };
    default:
      return assertNever(key);
  }
}
