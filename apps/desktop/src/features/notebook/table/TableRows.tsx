import type {
  ArtefactsFileModel,
  ColumnKey,
  SummaryPart,
} from "@research-notebook/format";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import { commands } from "../../../ipc/bindings";
import {
  newerVersionUpdate,
  resolveReference,
} from "../expanded/model/artefactReference";
import { useExperimentArtefacts } from "../expanded/model/useExperimentArtefacts";
import {
  collapseLabel,
  countLabel,
  expandLabel,
  expandedMessages,
  messages,
  selectLabel,
  statusLabel,
  tableMessages,
} from "../messages";
import type { ExperimentRow, HeaderRow } from "./model/rows";

/** Where a virtual row sits: taken out of the flow so only the rows in view exist. */
export type RowPlace = { style: CSSProperties; index: number };

/** An artefact reference inside a summary cell (FR-EDT-06), resolved against
 * the experiment's artefacts.yaml so its label, "detached" and "newer
 * version" state are current. Deliberately not focusable or clickable: the
 * table holds no live editor and this is a read-only overview (FR-TBL-05),
 * unlike the equivalent chip in the expanded view. */
function ReferenceChip({
  part,
  artefacts,
}: {
  part: Extract<SummaryPart, { kind: "ref" }>;
  artefacts: ArtefactsFileModel | null;
}) {
  const resolved = resolveReference(artefacts, {
    ulid: part.ulid,
    version: part.version,
    label: part.label,
  });
  if (resolved.status === "detached") {
    return (
      <span className="wtable__chip wtable__chip--detached">
        {resolved.label}
        <span className="wtable__chip-badge">
          {expandedMessages.detachedBadge}
        </span>
      </span>
    );
  }
  const newer =
    resolved.status === "resolved" && newerVersionUpdate(resolved) !== null;
  return (
    <span className="wtable__chip">
      {resolved.label}
      {newer && (
        <span className="wtable__chip-badge">
          {expandedMessages.newerVersionBadge}
        </span>
      )}
    </span>
  );
}

/** A cell's summary, clamped to a few lines by the style sheet. An artefact
 * reference shows as a chip (FR-EDT-06); the tooltip falls back to its
 * label, since a native `title` attribute cannot hold markup. */
export function SummaryCell({
  parts,
  artefacts,
}: {
  parts: readonly SummaryPart[];
  artefacts: ArtefactsFileModel | null;
}) {
  const flat = parts
    .map((part) => (part.kind === "ref" ? part.label : part.text))
    .join("");
  if (flat === "") {
    return (
      <span className="wtable__empty">
        <span aria-hidden="true">—</span>
        <span className="wtable__sr">{tableMessages.emptyCell}</span>
      </span>
    );
  }
  return (
    <div className="wtable__clamp" title={flat}>
      {parts.map((part, index) =>
        part.kind === "ref" ? (
          <ReferenceChip key={index} part={part} artefacts={artefacts} />
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </div>
  );
}

/** What a cell of `column` shows for one experiment. Read-only: the table holds no editors (FR-TBL-05). */
function cellFor(
  column: ColumnKey,
  row: ExperimentRow,
  artefacts: ArtefactsFileModel | null,
): ReactNode {
  switch (column) {
    case "methods":
      return (
        <SummaryCell parts={row.summaries.methods} artefacts={artefacts} />
      );
    case "results_notes":
      return (
        <SummaryCell
          parts={row.summaries.results_notes}
          artefacts={artefacts}
        />
      );
    case "interpretation":
      return (
        <SummaryCell
          parts={row.summaries.interpretation}
          artefacts={artefacts}
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
};

/** One experiment (FR-TBL-01). */
export function ExperimentRowView({
  row,
  place,
  columns,
  experimentWidth,
  selected,
  sharesRef,
  folder,
  onSelect,
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
          {cellFor(column.key, row, artefacts)}
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
