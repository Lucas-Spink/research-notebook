import type { CanvasFileModel } from "@research-notebook/format";
import { NOTE_CARD, connectNodes, noteNodes, type NoteNode } from "./notes";
import { tableNodes, type CellRef, type TableNode } from "./tables";
import type { Point } from "./nodes";

/** How far from a table its note is put, to the right of it. */
const BESIDE = 40;

/** One cell as a string, for sets and maps: `row/column`. */
export const cellId = (cell: CellRef): string => `${cell.row}/${cell.column}`;

const isNote = (file: CanvasFileModel, id: string): boolean =>
  noteNodes(file).some((n) => n.id === id);

/** A line from a note to a cell, as the file keeps it. */
type CellLink = { edge: string; note: string; table: string; cell: CellRef };

/** The lines of a canvas that end at a table cell, each with the note it comes from. */
function cellLinks(file: CanvasFileModel): CellLink[] {
  const tables = new Set(tableNodes(file).map((t) => t.id));
  return file.edges.flatMap((edge) => {
    const cell = edge.target_cell;
    return cell !== undefined &&
      tables.has(edge.target) &&
      isNote(file, edge.source)
      ? [{ edge: edge.id, note: edge.source, table: edge.target, cell }]
      : [];
  });
}

/**
 * The cells between two corners of a table, as a rectangle of rows and
 * columns, in reading order. A corner that is not in the table gives none.
 */
export function cellsBetween(
  table: TableNode,
  a: CellRef,
  b: CellRef,
): CellRef[] {
  const rows = [a.row, b.row].map((id) =>
    table.rows.findIndex((r) => r.id === id),
  );
  const columns = [a.column, b.column].map((id) =>
    table.columns.findIndex((c) => c.id === id),
  );
  if (rows.includes(-1) || columns.includes(-1)) return [];
  const [r1, r2] = [Math.min(...rows), Math.max(...rows)];
  const [c1, c2] = [Math.min(...columns), Math.max(...columns)];
  return table.rows.slice(r1, r2 + 1).flatMap((row) =>
    table.columns.slice(c1, c2 + 1).map((column) => ({
      row: row.id,
      column: column.id,
    })),
  );
}

/**
 * Adds a note about some cells of a table, beside the table: the note and one
 * line from it to each cell, all in one change (ADR-0071). `ids` are made by
 * the caller, first the note's and then each line's, so the change gives the
 * same result however many times it is applied. The file is returned as it
 * was when the table is missing, no cell is the table's, or `ids` is too short.
 */
export function addNoteForCells(
  file: CanvasFileModel,
  tableId: string,
  cells: readonly CellRef[],
  ids: readonly string[],
): CanvasFileModel {
  const table = tableNodes(file).find((t) => t.id === tableId);
  const own = cells.filter(
    (cell, i) =>
      table?.rows.some((r) => r.id === cell.row) === true &&
      table.columns.some((c) => c.id === cell.column) &&
      cells.findIndex((x) => cellId(x) === cellId(cell)) === i,
  );
  const [noteId, ...lines] = ids;
  if (
    table === undefined ||
    noteId === undefined ||
    own.length === 0 ||
    lines.length < own.length
  ) {
    return file;
  }
  const at: Point = {
    x: table.position.x + table.size.width + BESIDE,
    y: table.position.y,
  };
  const note: NoteNode = {
    id: noteId,
    type: "note",
    text: "",
    position: freePlace(file, at),
    size: { ...NOTE_CARD },
  };
  let next: CanvasFileModel = { ...file, nodes: [...file.nodes, note] };
  own.forEach((cell, i) => {
    next = connectNodes(next, noteId, tableId, () => lines[i] ?? "", {
      toCell: cell,
    });
  });
  return next;
}

/** `at`, moved down until no card is in the way of a note put there. */
function freePlace(file: CanvasFileModel, at: Point): Point {
  let spot = at;
  while (
    file.nodes.some(
      (n) =>
        Math.abs(n.position.x - spot.x) < 24 &&
        Math.abs(n.position.y - spot.y) < 24,
    )
  ) {
    spot = { x: spot.x, y: spot.y + 32 };
  }
  return spot;
}

/** The cells the selected notes are about, by table: what the table outlines. */
export function highlightedCells(
  file: CanvasFileModel,
  selected: ReadonlySet<string>,
): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const link of cellLinks(file)) {
    if (!selected.has(link.note)) continue;
    const set = out.get(link.table) ?? new Set<string>();
    set.add(cellId(link.cell));
    out.set(link.table, set);
  }
  return out;
}

/** The notes about each cell, by `table:row/column`, in file order: what a cell's badge counts. */
export function notesByCell(file: CanvasFileModel): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const link of cellLinks(file)) {
    const key = `${link.table}:${cellId(link.cell)}`;
    out.set(key, [...(out.get(key) ?? []), link.note]);
  }
  return out;
}

/** How many cells each note is about. */
export function cellCountByNote(file: CanvasFileModel): Map<string, number> {
  const out = new Map<string, number>();
  for (const link of cellLinks(file)) {
    out.set(link.note, (out.get(link.note) ?? 0) + 1);
  }
  return out;
}

/** The lines that join a note to cells, to remove when it is unlinked. */
export function cellLineIds(file: CanvasFileModel, noteId: string): string[] {
  return cellLinks(file)
    .filter((link) => link.note === noteId)
    .map((link) => link.edge);
}
