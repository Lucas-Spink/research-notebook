import type { ColumnKey } from "@research-notebook/format";
import { useId, useState, type FormEvent } from "react";
import {
  columnLabel,
  showColumnLabel,
  tableMessages,
  widthLabel,
} from "../messages";
import {
  MAX_WIDTH,
  MIN_WIDTH,
  clampWidth,
  type ColumnLayout,
} from "./model/columns";

type WidthProps = {
  label: string;
  width: number;
  onCommit: (width: number) => void;
};

/** A width typed in pixels, applied when the person leaves the field or presses Enter. */
function WidthField({ label, width, onCommit }: WidthProps) {
  const id = useId();
  const [text, setText] = useState(String(width));
  const [seen, setSeen] = useState(width);
  // A width that changed elsewhere, as by dragging the column edge, replaces what was typed.
  if (seen !== width) {
    setSeen(width);
    setText(String(width));
  }

  function apply(event?: FormEvent) {
    event?.preventDefault();
    const typed = Number(text);
    if (text.trim() === "" || !Number.isFinite(typed)) {
      setText(String(width));
      return;
    }
    const next = clampWidth(typed);
    setText(String(next));
    if (next !== width) onCommit(next);
  }

  return (
    <form onSubmit={apply}>
      <label htmlFor={id} className="wtable__sr">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={MIN_WIDTH}
        max={MAX_WIDTH}
        step={10}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => apply()}
      />
    </form>
  );
}

type Props = {
  layout: readonly ColumnLayout[];
  /** Read-only projects keep column changes for the session only. */
  writable: boolean;
  onHide: (key: ColumnKey, hidden: boolean) => void;
  onWidth: (key: ColumnKey, width: number) => void;
  onReset: () => void;
};

/**
 * Show, hide and size each column without the pointer (FR-TBL-04, spec
 * 10.2). Every column of `project.yaml` is listed, Motivation included, whose
 * width limits the summary in each question header.
 */
export function ColumnsMenu({
  layout,
  writable,
  onHide,
  onWidth,
  onReset,
}: Props) {
  const headingId = useId();
  return (
    <section className="notebook__columns" aria-labelledby={headingId}>
      <h4 id={headingId}>{tableMessages.columnsHeading}</h4>
      {!writable && <p>{tableMessages.sessionOnly}</p>}
      <ul>
        {layout.map((column) => {
          const label = columnLabel(column.key);
          return (
            <li key={column.key}>
              <label>
                <input
                  type="checkbox"
                  checked={!column.hidden}
                  onChange={() => onHide(column.key, !column.hidden)}
                />{" "}
                {showColumnLabel(label)}
              </label>
              <WidthField
                label={widthLabel(label)}
                width={column.width}
                onCommit={(width) => onWidth(column.key, width)}
              />
            </li>
          );
        })}
      </ul>
      <button type="button" onClick={onReset}>
        {tableMessages.resetColumns}
      </button>
    </section>
  );
}
