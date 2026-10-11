import type {
  CanvasFileModel,
  CanvasNodeModel,
} from "@research-notebook/format";
import type { Edge, Node } from "@xyflow/react";
import { assertNever } from "../../../shared/assertNever";
import type { Side } from "./notes";
import type { ArtefactNode, Point } from "./nodes";
import type { ResultInfo } from "./results";

export type ArtefactFlowData = {
  node: ArtefactNode;
  info: ResultInfo;
};
export type NoteFlowData = { text: string };
export type RegionFlowData = { label: string };

export type ArtefactFlowNode = Node<ArtefactFlowData, "artefact">;
export type NoteFlowNode = Node<NoteFlowData, "note">;
export type RegionFlowNode = Node<RegionFlowData, "region">;
export type CanvasFlowNode = ArtefactFlowNode | NoteFlowNode | RegionFlowNode;

/** The canvas file's lines as React Flow draws them. */
export function toFlowEdges(file: CanvasFileModel): Edge[] {
  const nodes = new Map(file.nodes.map((node) => [node.id, node]));
  return file.edges.map((edge) => {
    // A line drawn without sides (the first ones were) goes between the two cards' facing sides, not from the top of each.
    const facing = facingSides(nodes.get(edge.source), nodes.get(edge.target));
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.source_handle ?? facing.from,
      targetHandle: edge.target_handle ?? facing.to,
    };
  });
}

const centre = (node: CanvasNodeModel): Point => ({
  x: node.position.x + node.size.width / 2,
  y: node.position.y + node.size.height / 2,
});

/** The side of each card that faces the other: left and right when they are further apart across than down, else top and bottom. */
function facingSides(
  a: CanvasNodeModel | undefined,
  b: CanvasNodeModel | undefined,
): { from: Side; to: Side } {
  if (a === undefined || b === undefined) return { from: "right", to: "left" };
  const from = centre(a);
  const to = centre(b);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx >= 0
      ? { from: "right", to: "left" }
      : { from: "left", to: "right" };
  }
  return dy >= 0
    ? { from: "bottom", to: "top" }
    : { from: "top", to: "bottom" };
}

/**
 * The canvas file's cards as React Flow draws them. `resolve` says what each
 * result card points at now; `selected` keeps the cards that were selected
 * selected when the file changes underneath them (a save, a pin).
 */
export function toFlowNodes(
  file: CanvasFileModel,
  resolve: (node: ArtefactNode) => ResultInfo,
  selected: ReadonlySet<string>,
): CanvasFlowNode[] {
  return file.nodes.map((node): CanvasFlowNode => {
    const common = {
      id: node.id,
      position: { ...node.position },
      width: node.size.width,
      height: node.size.height,
      selected: selected.has(node.id),
    };
    switch (node.type) {
      case "artefact":
        return {
          ...common,
          type: "artefact",
          data: { node, info: resolve(node) },
        };
      case "note":
        return { ...common, type: "note", data: { text: node.text } };
      case "region":
        // A region sits behind the cards it holds.
        return {
          ...common,
          type: "region",
          zIndex: -1,
          data: { label: node.label },
        };
      default:
        return assertNever(node);
    }
  });
}
