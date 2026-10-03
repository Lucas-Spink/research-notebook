import type {
  ArtefactsFileModel,
  ColumnKey,
  RecognisedSectionKey,
} from "@research-notebook/format";
import type { CSSProperties, ReactNode } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import { isLiveIn } from "../editing/model/liveEditor";
import { evidenceOf } from "../model/evidence";
import {
  collapseLabel,
  countLabel,
  expandLabel,
  messages,
  selectLabel,
  tableMessages,
} from "../messages";
import { EditableSectionCell, type TableEditing } from "./EditableSectionCell";
import { ResultsCell } from "./ResultsCell";
import { ExperimentCell } from "./ExperimentCell";
import type { ExperimentRow, HeaderRow } from "./model/rows";

/**
 * Where a virtual row sits: taken out of the flow so only the rows in view
 * exist. Every row carries the virtualiser's measuring ref, since each grows
 * to fit its wrapped content (S6-T01).
 */
export type RowPlace = {
  style: CSSProperties;
  index: number;
  measure: { ref: (node: HTMLElement | null) => void; dataIndex: number };
};

const SECTIONS: readonly RecognisedSectionKey[] = [
  "methods",
  "results_notes",
  "interpretation",
];

function isSection(column: ColumnKey): column is RecognisedSectionKey {
  return SECTIONS.some((section) => section === column);
}

/** What a cell of `column` shows for one experiment: a section can be edited in place (FR-TBL-11); the rest are read-only. */
function cellFor(
  column: ColumnKey,
  row: ExperimentRow,
  artefacts: ArtefactsFileModel | null,
  folder: FolderHandle,
  editing: TableEditing,
  tabbable: boolean,
): ReactNode {
  switch (column) {
    case "methods":
    case "results_notes":
    case "interpretation":
      return (
        <EditableSectionCell
          row={row}
          section={column}
          parts={row.summaries[column]}
          artefacts={artefacts}
          folder={folder}
          editing={editing}
          tabbable={tabbable}
        />
      );
    case "literature":
      // No column of its own: citations are read in the text, and the
      // Bibliography below the table lists the sources (S6-T01).
      return null;
    case "results":
      return (
        <ResultsCell
          row={row}
          artefacts={artefacts}
          folder={folder}
          editing={editing}
          tabbable={tabbable}
        />
      );
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
  /** Picked as a row, so highlighted; `selected` alone (a cell was chosen) is not. */
  picked: boolean;
  sharesRef: boolean;
  /** The column of this row whose cell is chosen, so it shows the selection outline; `null` when none is. */
  selectedCol: number | null;
  /** The open project, so a reference chip can read this experiment's
   * artefacts.yaml (FR-EDT-06), the same as the expanded view. */
  folder: FolderHandle;
  onSelect: (row: ExperimentRow) => void;
  editing: TableEditing;
  /** The column of this row holding the grid's one tab stop, or `null` when another row has it (ADR-0043 point 5). */
  focusCol: number | null;
};

/** One experiment (FR-TBL-01), whose section cells edit in place (FR-TBL-11). */
export function ExperimentRowView({
  row,
  place,
  columns,
  experimentWidth,
  selected,
  picked,
  sharesRef,
  selectedCol,
  folder,
  onSelect,
  editing,
  focusCol,
}: ExperimentProps) {
  const artefacts = evidenceOf(row.item);
  return (
    <div
      ref={place.measure.ref}
      data-index={place.measure.dataIndex}
      role="row"
      aria-rowindex={place.index}
      className={`wtable__row${picked ? " wtable__row--selected" : ""}`}
      style={place.style}
    >
      <ExperimentCell
        row={row}
        width={experimentWidth}
        selected={selected}
        cellSelected={selectedCol === 0}
        sharesRef={sharesRef}
        tabbable={focusCol === 0}
        editing={editing}
        onSelect={onSelect}
      />
      {columns.map((column, index) => {
        const col = index + 1;
        const tabbable = focusCol === col;
        // A section that can be edited holds its own control (its Edit
        // button, or its live editor), which takes the tab stop instead; the
        // Results cell always does, since its folders can be browsed even
        // read-only.
        const ownControl =
          column.key === "results" ||
          (isSection(column.key) && editing.writable && !row.item.readOnly);
        const isEditing =
          (column.key === "results" &&
            editing.openResults === row.item.experiment.folder) ||
          (isSection(column.key) &&
            isLiveIn(
              editing.live.target,
              row.item.experiment.folder,
              column.key,
              "table",
            ));
        return (
          <div
            key={column.key}
            role="gridcell"
            data-grid-row={row.key}
            data-grid-col={col}
            tabIndex={ownControl ? undefined : tabbable ? 0 : -1}
            className={`wtable__cell${isEditing ? " wtable__cell--editing" : selectedCol === col ? " wtable__cell--selected" : ""}`}
            style={{ width: column.width }}
          >
            {cellFor(column.key, row, artefacts, folder, editing, tabbable)}
          </div>
        );
      })}
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
  picked: boolean;
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
  picked,
  sharesRef,
  onToggle,
  onSelect,
}: HeaderProps) {
  const name = row.ref ?? messages.unassignedHeading;
  return (
    <div
      ref={place.measure.ref}
      data-index={place.measure.dataIndex}
      role="row"
      aria-rowindex={place.index}
      className={`wtable__question${picked ? " wtable__row--selected" : ""}`}
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
      ref={place.measure.ref}
      data-index={place.measure.dataIndex}
      role="row"
      aria-rowindex={place.index}
      className="wtable__none"
      style={place.style}
    >
      <div role="gridcell">{tableMessages.noMatches}</div>
    </div>
  );
}
