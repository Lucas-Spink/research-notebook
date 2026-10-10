import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

type Props = {
  /** The element the popover opens beside: a row, or its actions button. */
  anchor: HTMLElement;
  /** Names the popover for screen readers. */
  label: string;
  onClose: () => void;
  children: ReactNode;
};

const GAP = 2;
const MARGIN = 8;

/** Items arrow keys move between. */
const ITEMS =
  "button:not(:disabled), input:not(:disabled), select:not(:disabled)";

/**
 * A small floating panel anchored to an element (issue #101). It is drawn
 * into the page body, so it overlays the table instead of adding to a row's
 * height, and it stays inside the window: below the anchor when there is
 * room, above it when not, and shifted left rather than cut off. Escape, a
 * click outside, or the window being scrolled or resized close it. Arrow
 * keys, Home and End move between its items. Keys typed in it stop here, so
 * the table's own keyboard grid never sees them.
 */
export function Popover({ anchor, label, onClose, children }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(
    null,
  );

  // Placed after every render, because the content changes size (a menu
  // becomes a picker); it only sets state when the spot actually moved.
  useLayoutEffect(() => {
    const element = box.current;
    if (element === null) return;
    const at = anchor.getBoundingClientRect();
    const size = element.getBoundingClientRect();
    let left = Math.min(
      at.right - size.width,
      window.innerWidth - size.width - MARGIN,
    );
    if (left < MARGIN)
      left = Math.max(
        MARGIN,
        Math.min(at.left, window.innerWidth - size.width - MARGIN),
      );
    let top = at.bottom + GAP;
    if (top + size.height > window.innerHeight - MARGIN) {
      top = Math.max(MARGIN, at.top - size.height - GAP);
    }
    setPlace((current) =>
      current !== null && current.left === left && current.top === top
        ? current
        : { left, top },
    );
  });

  useEffect(() => {
    box.current?.querySelector<HTMLElement>(ITEMS)?.focus();
  }, []);

  useEffect(() => {
    const outside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && !box.current?.contains(target)) onClose();
    };
    const away = () => onClose();
    document.addEventListener("mousedown", outside);
    window.addEventListener("resize", away);
    window.addEventListener("scroll", away, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      window.removeEventListener("resize", away);
      window.removeEventListener("scroll", away, true);
    };
  }, [onClose]);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    event.stopPropagation();
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    const items = [
      ...(box.current?.querySelectorAll<HTMLElement>(ITEMS) ?? []),
    ];
    const at = items.findIndex((item) => item === document.activeElement);
    const to =
      event.key === "ArrowDown"
        ? at + 1
        : event.key === "ArrowUp"
          ? at - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? items.length - 1
              : null;
    // A text field keeps its own Up, Down, Home and End.
    if (to === null || document.activeElement instanceof HTMLInputElement)
      return;
    event.preventDefault();
    items[(to + items.length) % items.length]?.focus();
  }

  return createPortal(
    <div
      ref={box}
      role="dialog"
      aria-label={label}
      className="results-popover"
      style={{
        left: place?.left ?? 0,
        top: place?.top ?? 0,
        visibility: place === null ? "hidden" : "visible",
      }}
      onKeyDown={onKeyDown}
    >
      {children}
    </div>,
    document.body,
  );
}
