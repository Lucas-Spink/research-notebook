import type { CanvasFileModel } from "@research-notebook/format";
import type { Node } from "@xyflow/react";
import { assertNever } from "../../../shared/assertNever";
import type { ArtefactNode } from "./nodes";
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
