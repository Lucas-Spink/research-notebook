import {
  CANVAS_TABLE_FORMAT_VERSION,
  type CanvasFileModel,
  type CanvasNodeModel,
} from "@research-notebook/format";
import { assertNever } from "../../../shared/assertNever";
import type { Extent, PinRef, Point } from "./nodes";

/** A table of figures as stored in a canvas file (ADR-0071). */
export type TableNode = Extract<CanvasNodeModel, { type: "table" }>;
export type TableCell = TableNode["cells"][number];

/** The size a new table has: its width is the one that is kept, its height follows from the pictures in it. */
export const DEFAULT_TABLE: Extent = { width: 640, height: 400 };

/** The least a table may be resized to across, and the height of the bar of buttons above its grid. */
export const MIN_TABLE_WIDTH = 320;
export const TABLE_TOOLBAR_HEIGHT = 32;

/** The room for a row's heading at the left and a column's at the top. */
export const ROW_HEADER_WIDTH = 120;
export const COLUMN_HEADER_HEIGHT = 32;

/** The shape of a cell whose picture is not known: also what an empty cell is drawn as. */
export const DEFAULT_ASPECT = 4 / 3;

/** The least width a column may be drawn, so a very narrow table still shows its cells. */
const MIN_CELL_WIDTH = 40;

const isTable = (node: CanvasNodeModel): node is TableNode =>
  node.type === "table";

/** The tables of a canvas, in file order. */
export function tableNodes(file: CanvasFileModel): TableNode[] {
  return file.nodes.filter(isTable);
}

/** The headings a new table starts with: one entry per row and per column. */
export type TableLabels = {
  rows: readonly string[];
  columns: readonly string[];
};

/**
 * Adds a table centred on `at`. The canvas becomes version 3, which one that
 * holds a table must be (ADR-0071). `newId` makes the ids of the table and of
 * each row and column, and is injected so tests are deterministic.
 */
export function addTable(
  file: CanvasFileModel,
  at: Point,
  newId: () => string,
  labels: TableLabels,
): CanvasFileModel {
  const table: TableNode = {
    id: newId(),
    type: "table",
    rows: labels.rows.map((label) => ({ id: newId(), label })),
    columns: labels.columns.map((label) => ({ id: newId(), label })),
    cells: [],
    fit: "row",
    position: {
      x: Math.round(at.x - DEFAULT_TABLE.width / 2),
      y: Math.round(at.y - DEFAULT_TABLE.height / 2),
    },
    size: { ...DEFAULT_TABLE },
  };
  return {
    ...file,
    format_version: CANVAS_TABLE_FORMAT_VERSION,
    nodes: [...file.nodes, table],
  };
}

/** What can be done to a table (ADR-0071). */
export type TableChange =
  | { kind: "addRow"; id: string; label: string }
  | { kind: "addColumn"; id: string; label: string }
  | { kind: "removeRow"; id: string }
  | { kind: "removeColumn"; id: string }
  | { kind: "heading"; line: "row" | "column"; id: string; label: string }
  | { kind: "setCell"; row: string; column: string; ref: PinRef }
  | { kind: "clearCell"; row: string; column: string }
  /** A picture's width over its height, once it has loaded. */
  | { kind: "aspect"; row: string; column: string; aspect: number }
  | { kind: "fit"; fit: "row" | "column" };

/** A heading the file can hold: one line, not empty, no control characters. */
const usableLabel = (label: string): boolean =>
  label.trim() !== "" &&
  [...label].every((ch) => {
    const code = ch.charCodeAt(0);
    return code > 0x1f && code !== 0x7f;
  });

const cellKey = (row: string, column: string) => `${row}/${column}`;

/** The table after `change`, or the same table if the change does nothing. */
function changeTable(table: TableNode, change: TableChange): TableNode {
  const hasRow = (id: string) => table.rows.some((r) => r.id === id);
  const hasColumn = (id: string) => table.columns.some((c) => c.id === id);
  switch (change.kind) {
    case "addRow":
      return usableLabel(change.label)
        ? {
            ...table,
            rows: [...table.rows, { id: change.id, label: change.label }],
          }
        : table;
    case "addColumn":
      return usableLabel(change.label)
        ? {
            ...table,
            columns: [...table.columns, { id: change.id, label: change.label }],
          }
        : table;
    case "removeRow":
      return hasRow(change.id)
        ? {
            ...table,
            rows: table.rows.filter((r) => r.id !== change.id),
            cells: table.cells.filter((c) => c.row !== change.id),
          }
        : table;
    case "removeColumn":
      return hasColumn(change.id)
        ? {
            ...table,
            columns: table.columns.filter((c) => c.id !== change.id),
            cells: table.cells.filter((c) => c.column !== change.id),
          }
        : table;
    case "heading": {
      if (!usableLabel(change.label)) return table;
      const lines = change.line === "row" ? table.rows : table.columns;
      const target = lines.find((l) => l.id === change.id);
      if (target === undefined || target.label === change.label) return table;
      const renamed = lines.map((l) =>
        l.id === change.id ? { ...l, label: change.label } : l,
      );
      return change.line === "row"
        ? { ...table, rows: renamed }
        : { ...table, columns: renamed };
    }
    case "setCell": {
      if (!hasRow(change.row) || !hasColumn(change.column)) return table;
      const cell: TableCell = {
        row: change.row,
        column: change.column,
        experiment_id: change.ref.experimentId,
        artefact_id: change.ref.artefactId,
        ...(change.ref.version === undefined
          ? {}
          : { version: change.ref.version }),
      };
      const others = table.cells.filter(
        (c) => !(c.row === change.row && c.column === change.column),
      );
      return { ...table, cells: [...others, cell] };
    }
    case "clearCell": {
      const kept = table.cells.filter(
        (c) => !(c.row === change.row && c.column === change.column),
      );
      return kept.length === table.cells.length
        ? table
        : { ...table, cells: kept };
    }
    case "aspect": {
      if (!Number.isFinite(change.aspect) || change.aspect <= 0) return table;
      const cell = table.cells.find(
        (c) => c.row === change.row && c.column === change.column,
      );
      if (cell === undefined || cell.aspect === change.aspect) return table;
      return {
        ...table,
        cells: table.cells.map((c) =>
          c === cell ? { ...c, aspect: change.aspect } : c,
        ),
      };
    }
    case "fit":
      return table.fit === change.fit ? table : { ...table, fit: change.fit };
    default:
      return assertNever(change);
  }
}

/** Lines that end at a cell of `table` which `table` no longer has. */
function withoutDanglingCellLines(
  file: CanvasFileModel,
  table: TableNode,
): CanvasFileModel {
  const rows = new Set(table.rows.map((r) => r.id));
  const columns = new Set(table.columns.map((c) => c.id));
  const dangling = (
    node: string,
    cell: { row: string; column: string } | undefined,
  ) =>
    node === table.id &&
    cell !== undefined &&
    !(rows.has(cell.row) && columns.has(cell.column));
  const edges = file.edges.filter(
    (edge) =>
      !dangling(edge.source, edge.source_cell) &&
      !dangling(edge.target, edge.target_cell),
  );
  return edges.length === file.edges.length ? file : { ...file, edges };
}

/**
 * Applies `change` to the table `id`. The file is returned as it was when
 * there is no such table or the change does nothing. Removing a row or column
 * also removes the lines that ended at its cells (ADR-0071). Pure.
 */
export function applyTableChange(
  file: CanvasFileModel,
  id: string,
  change: TableChange,
): CanvasFileModel {
  const current = tableNodes(file).find((t) => t.id === id);
  if (current === undefined) return file;
  const next = changeTable(current, change);
  if (next === current) return file;
  const nodes = file.nodes.map((node) => (node.id === id ? next : node));
  return withoutDanglingCellLines({ ...file, nodes }, next);
}

/**
 * Puts results in a table: the first in the cell dropped on (replacing what
 * was there), the rest in the next empty cells along that row and then down
 * the rows below, in order. Results past the last empty cell are not placed;
 * `placed` says how many were.
 */
export function fillCells(
  file: CanvasFileModel,
  id: string,
  start: { row: string; column: string },
  refs: readonly PinRef[],
): { file: CanvasFileModel; placed: number } {
  const table = tableNodes(file).find((t) => t.id === id);
  if (table === undefined) return { file, placed: 0 };
  const startRow = table.rows.findIndex((r) => r.id === start.row);
  const startColumn = table.columns.findIndex((c) => c.id === start.column);
  if (startRow < 0 || startColumn < 0 || refs.length === 0) {
    return { file, placed: 0 };
  }
  const filled = new Set(table.cells.map((c) => cellKey(c.row, c.column)));
  let next = file;
  let placed = 0;
  const [first, ...rest] = refs;
  if (first !== undefined) {
    next = applyTableChange(next, id, {
      kind: "setCell",
      row: start.row,
      column: start.column,
      ref: first,
    });
    placed = 1;
    filled.add(cellKey(start.row, start.column));
  }
  const order = table.rows.flatMap((row, r) =>
    table.columns.flatMap((column, c) =>
      r > startRow || (r === startRow && c > startColumn)
        ? [{ row: row.id, column: column.id }]
        : [],
    ),
  );
  for (const ref of rest) {
    const slot = order.find((o) => !filled.has(cellKey(o.row, o.column)));
    if (slot === undefined) break;
    next = applyTableChange(next, id, { kind: "setCell", ...slot, ref });
    filled.add(cellKey(slot.row, slot.column));
    placed += 1;
  }
  return { file: next, placed };
}

/** Where a table's lines and cells fall: sizes in pixels, headings included in `width` and `height`. */
export type TableLayout = {
  columnWidths: number[];
  rowHeights: number[];
  width: number;
  height: number;
};

/** The shape that sets a line of cells: the tallest of their pictures (the smallest width over height), so none is cut off, else the default. */
function shapeOf(cells: readonly TableCell[]): number {
  const known = cells.flatMap((c) =>
    c.aspect === undefined ? [] : [c.aspect],
  );
  return known.length === 0 ? DEFAULT_ASPECT : Math.min(...known);
}

/**
 * The sizes a table is drawn at (ADR-0071). The table's width is stored and
 * the rest follows from the pictures. With `fit: "row"` the columns share the
 * width and each row is as tall as its tallest picture needs; with
 * `fit: "column"` the rows share one height and each column is as wide as its
 * tallest picture needs, so identical figures in a line fill their cells. A
 * cell whose picture is not yet known is drawn at the default shape. Pure.
 */
export function layoutTable(table: TableNode): TableLayout {
  const columns = table.columns.length;
  const inner = Math.max(
    table.size.width - ROW_HEADER_WIDTH,
    columns * MIN_CELL_WIDTH,
  );
  const cellsOf = (key: "row" | "column", id: string) =>
    table.cells.filter((c) => c[key] === id);

  let columnWidths: number[];
  let rowHeights: number[];
  if (table.fit === "row") {
    columnWidths = table.columns.map(() =>
      Math.round(inner / Math.max(columns, 1)),
    );
    const each = inner / Math.max(columns, 1);
    rowHeights = table.rows.map((r) =>
      Math.round(each / shapeOf(cellsOf("row", r.id))),
    );
  } else {
    const shapes = table.columns.map((c) => shapeOf(cellsOf("column", c.id)));
    const total = shapes.reduce((sum, s) => sum + s, 0);
    const height = total === 0 ? 0 : inner / total;
    rowHeights = table.rows.map(() => Math.round(height));
    columnWidths = shapes.map((s) => Math.round(s * height));
  }
  const width =
    columns === 0
      ? table.size.width
      : ROW_HEADER_WIDTH + columnWidths.reduce((sum, w) => sum + w, 0);
  const height =
    COLUMN_HEADER_HEIGHT + rowHeights.reduce((sum, h) => sum + h, 0);
  return { columnWidths, rowHeights, width: Math.round(width), height };
}

/** The table's position in a canvas file's `size`, for resizing: the width is kept, the height follows the pictures. */
export function tableExtent(table: TableNode): Extent {
  const layout = layoutTable(table);
  return { width: layout.width, height: layout.height };
}
