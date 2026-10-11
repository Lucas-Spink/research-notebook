import { canvasMessages as m } from "./messages";

/** The two ways of looking at the same notebook (ADR-0064). */
export type ViewMode = "table" | "canvas";

type Props = {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Turns the switch off while a change of view would be lost, such as while saving. */
  disabled?: boolean;
};

const MODES: readonly { mode: ViewMode; label: string }[] = [
  { mode: "table", label: m.table },
  { mode: "canvas", label: m.canvas },
];

/**
 * Table or Canvas. Both show the same experiments and text; choosing one
 * changes only how they are laid out, so nothing is lost by switching.
 */
export function ViewSwitch({ mode, onChange, disabled = false }: Props) {
  return (
    <div role="group" aria-label={m.viewLabel} className="view-switch">
      {MODES.map((option) => (
        <button
          key={option.mode}
          type="button"
          className="view-switch__button"
          aria-pressed={mode === option.mode}
          disabled={disabled}
          onClick={() => {
            if (mode !== option.mode) onChange(option.mode);
          }}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
