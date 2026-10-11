import type { CanvasFileModel } from "@research-notebook/format";
import type { EdgeChange, NodeChange } from "@xyflow/react";
import { assertNever } from "../../../shared/assertNever";
import { connectNodes, removeEdges, setNoteText } from "./notes";
import {
  moveNode,
  removeNodes,
  resizeNode,
  type Extent,
  type Point,
} from "./nodes";

/** A change worth keeping in the canvas file. */
export type CanvasEdit =
  | { kind: "move"; id: string; to: Point }
  | { kind: "resize"; id: string; to: Extent }
  | { kind: "remove"; ids: string[] }
  /** A note's text, exactly as typed. */
  | { kind: "noteText"; id: string; text: string }
  /** A line drawn between two cards; `id` is the new line's, made by the caller so this stays pure. */
  | { kind: "connect"; id: string; from: string; to: string }
  | { kind: "removeEdges"; ids: string[] };

/**
 * What of a batch of React Flow's changes belongs in the file. The library
 * reports every step of a drag or resize; only where one ended is kept, so a
 * gesture is one edit. A card's position at the end of a drag is read from
 * `nodes` (the cards as they now are), because the closing change may not
 * carry it. The measurements made when a card first appears are not edits.
 */
export function editsFrom(
  changes: readonly NodeChange[],
  nodes: readonly { id: string; position: Point }[],
): CanvasEdit[] {
  const edits: CanvasEdit[] = [];
  const removed: string[] = [];
  for (const change of changes) {
    switch (change.type) {
      case "position": {
        if (change.dragging === true) break;
        const now = nodes.find((node) => node.id === change.id);
        const to = now?.position ?? change.position;
        if (to !== undefined) edits.push({ kind: "move", id: change.id, to });
        break;
      }
      case "dimensions":
        if (change.resizing === false && change.dimensions !== undefined) {
          edits.push({ kind: "resize", id: change.id, to: change.dimensions });
        }
        break;
      case "remove":
        removed.push(change.id);
        break;
      case "select":
      case "add":
      case "replace":
        break;
      default:
        assertNever(change);
    }
  }
  return removed.length === 0
    ? edits
    : [...edits, { kind: "remove", ids: removed }];
}

/** The removal of lines is all of React Flow's changes to them that belongs in the file. */
export function edgeEditsFrom(changes: readonly EdgeChange[]): CanvasEdit[] {
  const ids = changes.flatMap((change) =>
    change.type === "remove" ? [change.id] : [],
  );
  return ids.length === 0 ? [] : [{ kind: "removeEdges", ids }];
}

/** The file after the edits, in order; the same file if none changed anything. */
export function applyEdits(
  file: CanvasFileModel,
  edits: readonly CanvasEdit[],
): CanvasFileModel {
  return edits.reduce((current, edit) => {
    switch (edit.kind) {
      case "move":
        return moveNode(current, edit.id, edit.to);
      case "resize":
        return resizeNode(current, edit.id, edit.to);
      case "remove":
        return removeNodes(current, edit.ids);
      case "noteText":
        return setNoteText(current, edit.id, edit.text);
      case "connect":
        return connectNodes(current, edit.from, edit.to, () => edit.id);
      case "removeEdges":
        return removeEdges(current, edit.ids);
      default:
        return assertNever(edit);
    }
  }, file);
}
