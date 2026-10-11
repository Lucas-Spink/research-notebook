import { useRef, type KeyboardEvent, type PointerEvent } from "react";

type Props = {
  label: string;
  /** The width of the panel this handle resizes, in pixels. */
  value: number;
  min: number;
  max: number;
  /** Which way a drag to the right changes the panel: +1 grows it, -1 shrinks it. */
  direction: 1 | -1;
  onResize: (width: number) => void;
  onNudge: (delta: number) => void;
};

const STEP = 16;
const BIG_STEP = 64;

/**
 * The handle between two regions, draggable and usable from the keyboard
 * (arrow keys, with Shift for bigger steps; Home and End for the limits). It
 * is a separator in the accessibility tree and reports the panel width it
 * controls.
 */
export function Splitter({
  label,
  value,
  min,
  max,
  direction,
  onResize,
  onNudge,
}: Props) {
  const start = useRef<{ x: number; width: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    start.current = { x: event.clientX, width: value };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const from = start.current;
    if (from === null) return;
    onResize(from.width + direction * (event.clientX - from.x));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    start.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? BIG_STEP : STEP;
    switch (event.key) {
      case "ArrowRight":
        onNudge(direction * step);
        break;
      case "ArrowLeft":
        onNudge(-direction * step);
        break;
      case "Home":
        onResize(min);
        break;
      case "End":
        onResize(max);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      tabIndex={0}
      className="canvas-splitter"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
    />
  );
}
