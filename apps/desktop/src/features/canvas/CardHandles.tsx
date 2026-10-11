import { Handle, Position } from "@xyflow/react";
import { useCard } from "./CardContext";
import { canvasMessages as m } from "./messages";

const SIDES = [Position.Top, Position.Right, Position.Bottom, Position.Left];

/**
 * The points on a card's edge that a line is drawn from or to (ADR-0065).
 * They are all of one kind and the canvas lets any join any, so a line can be
 * started at either end; which ends may be joined is decided by the model. A
 * canvas that cannot be changed has none.
 */
export function CardHandles() {
  const { editable } = useCard();
  if (!editable) return null;
  return (
    <>
      {SIDES.map((side) => (
        <Handle
          key={side}
          id={side}
          type="source"
          position={side}
          className="canvas-handle nodrag"
          aria-label={m.noteHandle}
        />
      ))}
    </>
  );
}
