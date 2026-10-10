import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import "./Ribbon.css";

type Props = {
  /** The button's text, and the menu's accessible name. */
  label: string;
  disabled?: boolean;
  /** `primary` fills the button with the accent for a view's one main action. */
  variant?: "primary" | "plain";
  /** What the button shows when it is not the label, such as an icon; the label still names it. */
  trigger?: ReactNode;
  /** Opens the panel towards the left, for a button at the right edge. */
  alignEnd?: boolean;
  /** The menu's content; given a function that closes it. */
  children: ReactNode | ((close: () => void) => ReactNode);
};

/**
 * A ribbon button that opens a small panel beneath it, for the controls too
 * large to sit in the ribbon itself (S6-T01). It closes on Escape, on a press
 * outside it, and when asked to by its content, returning focus to its button
 * after Escape.
 */
export function RibbonMenu({
  label,
  disabled = false,
  variant = "plain",
  trigger,
  alignEnd = false,
  children,
}: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPress(event: PointerEvent) {
      if (event.target instanceof Node && root.current?.contains(event.target))
        return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", onPress);
    return () => document.removeEventListener("pointerdown", onPress);
  }, [open]);

  const close = () => setOpen(false);
  return (
    <div
      ref={root}
      className={`ribbon__menu${alignEnd ? " ribbon__menu--end" : ""}`}
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className={`ribbon__button${variant === "primary" ? " btn-primary" : ""}`}
        aria-label={trigger === undefined ? undefined : label}
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        {trigger ?? label}
      </button>
      {open && !disabled && (
        <div
          id={panelId}
          role="group"
          aria-label={label}
          className="ribbon__panel"
        >
          {typeof children === "function" ? children(close) : children}
        </div>
      )}
    </div>
  );
}
