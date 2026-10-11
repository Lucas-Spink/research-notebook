import type { NodeProps } from "@xyflow/react";
import type { NoteFlowNode, RegionFlowNode } from "./model/flowNodes";

/**
 * A canvas-only note. Notes are written by a later release; one found in a
 * file is shown as it is and kept when the canvas is saved.
 */
export function NoteCard({ data }: NodeProps<NoteFlowNode>) {
  return <div className="canvas-note">{data.text}</div>;
}

/** A labelled area behind other cards; see `NoteCard`. */
export function RegionCard({ data }: NodeProps<RegionFlowNode>) {
  return <div className="canvas-region">{data.label}</div>;
}
