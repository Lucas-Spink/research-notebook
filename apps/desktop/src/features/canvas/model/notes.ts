import type {
  CanvasFileModel,
  CanvasNodeModel,
} from "@research-notebook/format";
import type { Extent, Point } from "./nodes";
import type { CellRef } from "./tables";

/** A side of a card a line is drawn at. */
export type Side = "top" | "right" | "bottom" | "left";

/** A note card as stored in a canvas file (format-v1.md 4.9). */
export type NoteNode = Extract<CanvasNodeModel, { type: "note" }>;

/** The size a new note has. */
export const NOTE_CARD: Extent = { width: 260, height: 160 };

const isNote = (node: CanvasNodeModel): node is NoteNode =>
  node.type === "note";

/** The notes of a canvas, in file order. */
export function noteNodes(file: CanvasFileModel): NoteNode[] {
  return file.nodes.filter(isNote);
}

/** How far a new note is moved from one already close to its place, and how close counts. */
const STACK_STEP = 32;
const STACK_NEAR = 24;

/** `place`, or the nearest place down and to the right of it that no note's corner is close to, so notes added one after another do not sit exactly on top of each other. */
function freeSpot(file: CanvasFileModel, place: Point): Point {
  const notes = noteNodes(file);
  let spot = place;
  while (
    notes.some(
      (n) =>
        Math.abs(n.position.x - spot.x) < STACK_NEAR &&
        Math.abs(n.position.y - spot.y) < STACK_NEAR,
    )
  ) {
    spot = { x: spot.x + STACK_STEP, y: spot.y + STACK_STEP };
  }
  return spot;
}

/** Adds an empty note centred on `at`. `newId` is injected so tests are deterministic. */
export function addNote(
  file: CanvasFileModel,
  at: Point,
  newId: () => string,
): CanvasFileModel {
  const position = freeSpot(file, {
    x: Math.round(at.x - NOTE_CARD.width / 2),
    y: Math.round(at.y - NOTE_CARD.height / 2),
  });
  const note: NoteNode = {
    id: newId(),
    type: "note",
    text: "",
    position,
    size: { ...NOTE_CARD },
  };
  return { ...file, nodes: [...file.nodes, note] };
}

/** Gives a note its text, exactly as written. The file is returned as it was if nothing changes. */
export function setNoteText(
  file: CanvasFileModel,
  id: string,
  text: string,
): CanvasFileModel {
  let changed = false;
  const nodes = file.nodes.map((node) => {
    if (node.id !== id || !isNote(node) || node.text === text) return node;
    changed = true;
    return { ...node, text };
  });
  return changed ? { ...file, nodes } : file;
}

/**
 * Joins two cards with a line (ADR-0065). A line from a note to a figure is
 * the note's reference to that figure, so at least one end must be a note and
 * neither a region; a card is not joined to itself or twice to the same card.
 * The note is always the line's source, whichever way it was drawn. A line to a
 * table may end at one of its cells (ADR-0071), and one note may point at
 * several cells of a table. The file is returned as it was when the line is not
 * allowed.
 */
export function connectNodes(
  file: CanvasFileModel,
  from: string,
  to: string,
  newId: () => string,
  sides: {
    from?: Side | undefined;
    to?: Side | undefined;
    fromCell?: CellRef | undefined;
    toCell?: CellRef | undefined;
  } = {},
): CanvasFileModel {
  if (from === to) return file;
  const a = file.nodes.find((node) => node.id === from);
  const b = file.nodes.find((node) => node.id === to);
  if (a === undefined || b === undefined) return file;
  if (a.type === "region" || b.type === "region") return file;
  if (a.type !== "note" && b.type !== "note") return file;
  const flipped = a.type !== "note";
  const [source, target] = flipped ? [b, a] : [a, b];
  const [sourceSide, targetSide] = flipped
    ? [sides.to, sides.from]
    : [sides.from, sides.to];
  const cell =
    target.type === "table"
      ? flipped
        ? sides.fromCell
        : sides.toCell
      : undefined;
  if (cell !== undefined && !hasCell(target, cell)) return file;
  const joined = file.edges.some(
    (edge) =>
      (edge.source === source.id &&
        edge.target === target.id &&
        sameCell(edge.target_cell, cell)) ||
      (edge.source === target.id && edge.target === source.id),
  );
  if (joined) return file;
  return {
    ...file,
    edges: [
      ...file.edges,
      {
        id: newId(),
        source: source.id,
        target: target.id,
        ...(sourceSide === undefined ? {} : { source_handle: sourceSide }),
        ...(targetSide === undefined ? {} : { target_handle: targetSide }),
        ...(cell === undefined ? {} : { target_cell: cell }),
      },
    ],
  };
}

const sameCell = (a: CellRef | undefined, b: CellRef | undefined): boolean =>
  a?.row === b?.row && a?.column === b?.column;

/** Whether a table has a row and a column with these ids. */
const hasCell = (node: CanvasNodeModel, cell: CellRef): boolean =>
  node.type === "table" &&
  node.rows.some((r) => r.id === cell.row) &&
  node.columns.some((c) => c.id === cell.column);

/** Removes lines. The cards they joined are not touched. */
export function removeEdges(
  file: CanvasFileModel,
  ids: readonly string[],
): CanvasFileModel {
  const gone = new Set(ids);
  if (!file.edges.some((edge) => gone.has(edge.id))) return file;
  return { ...file, edges: file.edges.filter((edge) => !gone.has(edge.id)) };
}
