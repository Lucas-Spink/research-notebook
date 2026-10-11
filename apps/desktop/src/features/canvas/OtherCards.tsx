import { NodeResizer, type NodeProps } from "@xyflow/react";
import { useRef, useState } from "react";
import { CardHandles } from "./CardHandles";
import { useCard } from "./CardContext";
import { canvasMessages as m } from "./messages";
import type { NoteFlowNode, RegionFlowNode } from "./model/flowNodes";
import { citeTrigger, spliceCitation } from "./model/cite";
import { NOTE_CARD } from "./model/notes";
import { NoteCitationPicker } from "./NoteCitationPicker";

/**
 * A note on the canvas (ADR-0065): plain text written in place. It is not a
 * section of any experiment, so it never takes the application's one live
 * editor; what is typed goes to the canvas file after a short pause. A line
 * from it to a figure is its reference to that figure. Typing `/cite` opens
 * the citation picker, as in a section, and puts the citation where it was
 * typed.
 */
export function NoteCard({ id, data, selected }: NodeProps<NoteFlowNode>) {
  const { editable, onNoteText, onRemove } = useCard();
  const [draft, setDraft] = useState(data.text);
  const [seen, setSeen] = useState(data.text);
  const box = useRef<HTMLTextAreaElement>(null);
  // Where the citation goes once the picker is done, while it is open.
  const [citeAt, setCiteAt] = useState<number | null>(null);
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
          ref={box}
          aria-label={m.noteLabel}
          placeholder={m.notePlaceholder}
          value={draft}
          readOnly={!editable}
          onChange={(event) => {
            const value = event.target.value;
            const trigger = editable
              ? citeTrigger(value, event.target.selectionStart)
              : null;
            // The words that asked for the picker are taken out, as in a section.
            const next =
              trigger === null
                ? value
                : `${value.slice(0, trigger.start)}${value.slice(trigger.end)}`;
            setDraft(next);
            onNoteText(id, next);
            if (trigger !== null) setCiteAt(trigger.start);
          }}
        />
        {citeAt !== null && (
          <NoteCitationPicker
            onCancel={() => {
              setCiteAt(null);
              box.current?.focus();
            }}
            onInsert={(markdown) => {
              const put = spliceCitation(draft, citeAt, markdown);
              setCiteAt(null);
              setDraft(put.text);
              onNoteText(id, put.text);
              requestAnimationFrame(() => {
                box.current?.focus();
                box.current?.setSelectionRange(put.caret, put.caret);
              });
            }}
          />
        )}
        <CardHandles />
      </div>
    </>
  );
}

/** A labelled area behind other cards. Regions are written by a later release; one found in a file is shown as it is and kept. */
export function RegionCard({ data }: NodeProps<RegionFlowNode>) {
  return <div className="canvas-region">{data.label}</div>;
}
