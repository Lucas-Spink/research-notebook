import type { ColumnKey } from "@research-notebook/format";
import type { CSSProperties, ReactNode } from "react";
import {
  collapseLabel,
  countLabel,
  expandLabel,
  messages,
  selectLabel,
  statusLabel,
  tableMessages,
} from "../messages";
import type { ExperimentRow, HeaderRow } from "./model/rows";

/** Where a virtual row sits: taken out of the flow so only the rows in view exist. */
export type RowPlace = { style: CSSProperties; index: number };

/** A cell's text, clamped to a few lines by the style sheet, with the full text as its tooltip. */
function Clamped({ text }: { text: string }) {
  if (text === "") {
    return (
      <span className="wtable__empty">
        <span aria-hidden="true">—</span>
        <span className="wtable__sr">{tableMessages.emptyCell}</span>
      </span>
    );
  }
  return (
    <div className="wtable__clamp" title={text}>
      {text}
    </div>
  );
}

/** What a cell of `column` shows for one experiment. Read-only: the table holds no editors (FR-TBL-05). */
function cellFor(column: ColumnKey, row: ExperimentRow): ReactNode {
  switch (column) {
    case "methods":
      return <Clamped text={row.summaries.methods} />;
    case "results_notes":
      return <Clamped text={row.summaries.results_notes} />;
    case "interpretation":
      return <Clamped text={row.summaries.interpretation} />;
    case "literature":
      return <Clamped text={row.summaries.literature} />;
    case "results":
      return <span className="wtable__muted">{tableMessages.resultsNone}</span>;
    case "motivation":
      // Shown once in the question's header row, not in each experiment's.
      return null;
  }
}

type ExperimentProps = {
  row: ExperimentRow;
  place: RowPlace;
  columns: readonly { key: ColumnKey; width: number }[];
  experimentWidth: number;
  selected: boolean;
  sharesRef: boolean;
  onSelect: (row: ExperimentRow) => void;
};

/** One experiment (FR-TBL-01). */
export function ExperimentRowView({
  row,
  place,
  columns,
  experimentWidth,
  selected,
  sharesRef,
  onSelect,
}: ExperimentProps) {
  const front = row.item.experiment.file.frontmatter;
  const dates = [
    front.started === undefined
      ? null
      : `${messages.startedLabel} ${front.started}`,
    front.completed === undefined
      ? null
      : `${messages.completedLabel} ${front.completed}`,
  ].filter((part) => part !== null);
  return (
    <div
      role="row"
      aria-rowindex={place.index}
      className={`wtable__row${selected ? " wtable__row--selected" : ""}`}
      style={place.style}
    >
      <div
        role="cell"
        className="wtable__cell"
        style={{ width: experimentWidth }}
      >
        <button
          type="button"
          className="wtable__select"
          aria-pressed={selected}
          aria-label={selectLabel(front.ref)}
          onClick={() => onSelect(row)}
        >
          <strong>{front.ref}</strong> {front.title}
        </button>
        <div>
          <span className="wtable__status">{statusLabel(front.status)}</span>
          {dates.length > 0 && (
            <span className="wtable__muted"> · {dates.join(" · ")}</span>
          )}
        </div>
        {(sharesRef || row.item.absentFromOrder || row.item.readOnly) && (
          <div className="wtable__flag">
            {[
              sharesRef ? messages.duplicateRefBadge : null,
              row.item.readOnly ? messages.readOnlyItem : null,
              row.item.absentFromOrder && !row.item.readOnly
                ? messages.notInOrder
                : null,
            ]
              .filter((part) => part !== null)
              .join(" · ")}
          </div>
        )}
      </div>
      {columns.map((column) => (
        <div
          key={column.key}
          role="cell"
          className="wtable__cell"
          style={{ width: column.width }}
        >
          {cellFor(column.key, row)}
        </div>
      ))}
    </div>
  );
}

type HeaderProps = {
  row: HeaderRow;
  place: RowPlace;
  columnCount: number;
  /** The Motivation column's width while it is shown, or `null` when hidden. */
  motivationWidth: number | null;
  selected: boolean;
  sharesRef: boolean;
  onToggle: (row: HeaderRow) => void;
  onSelect: (row: HeaderRow) => void;
};

/** A question's full-width header (FR-TBL-02): collapse control, title, count and Motivation summary. */
export function QuestionHeaderRowView({
  row,
  place,
  columnCount,
  motivationWidth,
  selected,
  sharesRef,
  onToggle,
  onSelect,
}: HeaderProps) {
  const name = row.ref ?? messages.unassignedHeading;
  return (
    <div
      role="row"
      aria-rowindex={place.index}
      className={`wtable__question${selected ? " wtable__row--selected" : ""}`}
      style={place.style}
    >
      <div
        role="rowheader"
        aria-colspan={columnCount}
        className="wtable__question-content"
      >
        <button
          type="button"
          className="wtable__collapse"
          aria-expanded={!row.collapsed}
          aria-label={row.collapsed ? expandLabel(name) : collapseLabel(name)}
          onClick={() => onToggle(row)}
        >
          <span aria-hidden="true">{row.collapsed ? "▸" : "▾"}</span>
        </button>
        {row.questionId === null ? (
          <strong>{messages.unassignedHeading}</strong>
        ) : (
          <button
            type="button"
            className="wtable__select"
            aria-pressed={selected}
            aria-label={selectLabel(name)}
            onClick={() => onSelect(row)}
          >
            <strong>{row.ref}</strong> {row.title}
          </button>
        )}
        <span className="wtable__count">
          {countLabel(row.shown, row.total, row.filtered)}
        </span>
        {sharesRef && (
          <span className="wtable__flag">{messages.duplicateRefBadge}</span>
        )}
        {row.readOnly && (
          <span className="wtable__flag">{messages.readOnlyItem}</span>
        )}
        {motivationWidth !== null && row.questionId !== null && (
          <span
            className="wtable__motivation"
            style={{ maxWidth: motivationWidth }}
            title={row.motivation}
          >
            {row.motivation === ""
              ? tableMessages.noMotivation
              : row.motivation}
          </span>
        )}
      </div>
    </div>
  );
}

/** Under an open question whose experiments the filter hid. */
export function EmptyRowView({ place }: { place: RowPlace }) {
  return (
    <div
      role="row"
      aria-rowindex={place.index}
      className="wtable__none"
      style={place.style}
    >
      <div role="cell">{tableMessages.noMatches}</div>
    </div>
  );
}
