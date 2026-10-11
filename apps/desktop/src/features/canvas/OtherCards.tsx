import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useState } from "react";
import { CardHandles } from "./CardHandles";
import { useCard } from "./CardContext";
import { canvasMessages as m } from "./messages";
import type { NoteFlowNode, RegionFlowNode } from "./model/flowNodes";
import { NOTE_CARD } from "./model/notes";

/**
 * A note on the canvas (ADR-0065): plain text written in place. It is not a
 * section of any experiment, so it never takes the application's one live
 * editor; what is typed goes to the canvas file after a short pause. A line
 * from it to a figure is its reference to that figure.
 */
export function NoteCard({ id, data, selected }: NodeProps<NoteFlowNode>) {
  const { editable, onNoteText, onRemove } = useCard();
  const [draft, setDraft] = useState(data.text);
  const [seen, setSeen] = useState(data.text);
  // The file changed underneath (reloaded, saved elsewhere): show it, unless it is just what was typed.
  if (data.text !== seen) {
    setSeen(data.text);
    if (data.text !== draft) setDraft(data.text);
  }
  return (
    <>
      <NodeResizer
        isVisible={selected && editable}
        minWidth={NOTE_CARD.width / 2}
        minHeight={NOTE_CARD.height / 2}
        handleClassName="canvas-resize-handle"
        lineClassName="canvas-resize-line"
      />
      <div className="canvas-note" role="group" aria-label={m.noteLabel}>
        {editable && (
          <button
            type="button"
            className="canvas-note__remove nodrag nopan"
            aria-label={m.removeNote}
            title={m.removeNote}
            onClick={() => onRemove(id)}
          >
            ×
          </button>
        )}
        <textarea
          className="canvas-note__text nodrag nopan nowheel"
          aria-label={m.noteLabel}
          placeholder={m.notePlaceholder}
          value={draft}
          readOnly={!editable}
          onChange={(event) => {
            setDraft(event.target.value);
            onNoteText(id, event.target.value);
          }}
        />
        <CardHandles />
      </div>
    </>
  );
}

/** A labelled area behind other cards. Regions are written by a later release; one found in a file is shown as it is and kept. */
export function RegionCard({ data }: NodeProps<RegionFlowNode>) {
  return <div className="canvas-region">{data.label}</div>;
}
