import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  MAX_WIDTH,
  MIN_WIDTH,
  clampWidth,
  keyboardWidth,
} from "./model/columns";

type Props = {
  label: string;
  width: number;
  /** While dragging: the width so far, or `null` when the drag ends. Not saved. */
  onLive: (width: number | null) => void;
  /** A width to keep. `immediate` at the end of a drag, otherwise after a short wait. */
  onCommit: (width: number, options: { immediate: boolean }) => void;
};

/**
 * The edge of a column header. Dragging it shows the new width as it goes and
 * saves once at the end; with keyboard focus the arrow keys, Home and End
 * change the width (spec 10.2). It is a focusable separator with its value
 * exposed, as the ARIA window splitter pattern describes.
 */
export function ResizeHandle({ label, width, onLive, onCommit }: Props) {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  function move(event: PointerEvent<HTMLDivElement>) {
    const started = drag.current;
    if (started === null) return;
    onLive(clampWidth(started.startWidth + event.clientX - started.startX));
  }

  function end(event: PointerEvent<HTMLDivElement>) {
    const started = drag.current;
    drag.current = null;
    if (started === null) return;
    const finished = clampWidth(
      started.startWidth + event.clientX - started.startX,
    );
    onLive(null);
    if (finished !== started.startWidth) {
      onCommit(finished, { immediate: true });
    }
  }

  function key(event: KeyboardEvent<HTMLDivElement>) {
    const next = keyboardWidth(width, event.key, event.shiftKey);
    if (next === null) return;
    event.preventDefault();
    if (next !== width) onCommit(next, { immediate: false });
  }

  return (
    <div
      className="wtable__resize"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={MIN_WIDTH}
      aria-valuemax={MAX_WIDTH}
      onKeyDown={key}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startX: event.clientX, startWidth: width };
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={() => {
        drag.current = null;
        onLive(null);
      }}
    />
  );
}
