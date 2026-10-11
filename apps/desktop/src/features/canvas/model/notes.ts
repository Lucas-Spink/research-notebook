import type {
  CanvasFileModel,
  CanvasNodeModel,
} from "@research-notebook/format";
import type { Extent, Point } from "./nodes";

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

/** Adds an empty note centred on `at`. `newId` is injected so tests are deterministic. */
export function addNote(
  file: CanvasFileModel,
  at: Point,
  newId: () => string,
): CanvasFileModel {
  const note: NoteNode = {
    id: newId(),
    type: "note",
    text: "",
    position: {
      x: Math.round(at.x - NOTE_CARD.width / 2),
      y: Math.round(at.y - NOTE_CARD.height / 2),
    },
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
 * The note is always the line's source, whichever way it was drawn. The file is
 * returned as it was when the line is not allowed.
 */
export function connectNodes(
  file: CanvasFileModel,
  from: string,
  to: string,
  newId: () => string,
  sides: { from?: Side | undefined; to?: Side | undefined } = {},
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
  const joined = file.edges.some(
    (edge) =>
      (edge.source === source.id && edge.target === target.id) ||
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
      },
    ],
  };
}

/** Removes lines. The cards they joined are not touched. */
export function removeEdges(
  file: CanvasFileModel,
  ids: readonly string[],
): CanvasFileModel {
  const gone = new Set(ids);
  if (!file.edges.some((edge) => gone.has(edge.id))) return file;
  return { ...file, edges: file.edges.filter((edge) => !gone.has(edge.id)) };
}
