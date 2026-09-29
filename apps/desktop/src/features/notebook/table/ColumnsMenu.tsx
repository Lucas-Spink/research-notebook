import type { ColumnKey } from "@research-notebook/format";
import { useId, useState, type FormEvent } from "react";
import {
  columnLabel,
  fontSizeLabel,
  showColumnLabel,
  tableMessages,
  widthLabel,
} from "../messages";
import {
  MAX_FONT_SIZE,
  MAX_WIDTH,
  MIN_FONT_SIZE,
  MIN_WIDTH,
  clampFontSize,
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

/** A text size typed in pixels; left empty, the column keeps the application's default. */
function FontSizeField({
  label,
  fontSize,
  onCommit,
}: {
  label: string;
  fontSize: number | null;
  onCommit: (fontSize: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState(fontSize === null ? "" : String(fontSize));
  const [seen, setSeen] = useState(fontSize);
  if (seen !== fontSize) {
    setSeen(fontSize);
    setText(fontSize === null ? "" : String(fontSize));
  }

  function apply(event?: FormEvent) {
    event?.preventDefault();
    const typed = Number(text);
    if (text.trim() === "" || !Number.isFinite(typed)) {
      setText(fontSize === null ? "" : String(fontSize));
      return;
    }
    const next = clampFontSize(typed);
    setText(String(next));
    if (next !== fontSize) onCommit(next);
  }

  return (
    <form onSubmit={apply}>
      <label htmlFor={id} className="wtable__sr">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={MIN_FONT_SIZE}
        max={MAX_FONT_SIZE}
        step={1}
        placeholder={tableMessages.defaultFontSize}
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
  onFontSize: (key: ColumnKey, fontSize: number) => void;
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
  onFontSize,
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
              <FontSizeField
                label={fontSizeLabel(label)}
                fontSize={column.fontSize}
                onCommit={(fontSize) => onFontSize(column.key, fontSize)}
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
