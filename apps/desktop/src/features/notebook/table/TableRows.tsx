import type {
  ArtefactsFileModel,
  ColumnKey,
  RecognisedSectionKey,
} from "@research-notebook/format";
import type { CSSProperties, ReactNode } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import { commands } from "../../../ipc/bindings";
import { isLiveIn } from "../editing/model/liveEditor";
import { useExperimentArtefacts } from "../expanded/model/useExperimentArtefacts";
import {
  collapseLabel,
  countLabel,
  expandLabel,
  messages,
  selectLabel,
  statusLabel,
  tableMessages,
} from "../messages";
import { EditableSectionCell, type TableEditing } from "./EditableSectionCell";
import type { ExperimentRow, HeaderRow } from "./model/rows";
import { SummaryCell } from "./SummaryCell";

/**
 * Where a virtual row sits: taken out of the flow so only the rows in view
 * exist. The row being edited also carries the virtualiser's measuring ref,
 * since it alone grows to fit its editor (ADR-0043).
 */
export type RowPlace = {
  style: CSSProperties;
  index: number;
  measure?: { ref: (node: HTMLElement | null) => void; dataIndex: number };
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
        />
      );
    case "literature":
      return (
        <SummaryCell parts={row.summaries.literature} artefacts={artefacts} />
      );
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
  /** The open project, so a reference chip can read this experiment's
   * artefacts.yaml (FR-EDT-06), the same as the expanded view. */
  folder: FolderHandle;
  onSelect: (row: ExperimentRow) => void;
  editing: TableEditing;
};

/** One experiment (FR-TBL-01), whose section cells edit in place (FR-TBL-11). */
export function ExperimentRowView({
  row,
  place,
  columns,
  experimentWidth,
  selected,
  sharesRef,
  folder,
  onSelect,
  editing,
}: ExperimentProps) {
  const artefacts = useExperimentArtefacts(
    commands,
    folder,
    row.item.experiment.folder,
  );
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
      ref={place.measure?.ref}
      data-index={place.measure?.dataIndex}
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
      {columns.map((column) => {
        const isEditing =
          isSection(column.key) &&
          isLiveIn(
            editing.live.target,
            row.item.experiment.folder,
            column.key,
            "table",
          );
        return (
          <div
            key={column.key}
            role="cell"
            className={`wtable__cell${isEditing ? " wtable__cell--editing" : ""}`}
            style={{ width: column.width }}
          >
            {cellFor(column.key, row, artefacts, folder, editing)}
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
