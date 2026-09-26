import { useEffect, useRef, useState } from "react";
import {
  messages,
  renameHint,
  selectLabel,
  statusLabel,
  statusOfLabel,
  statusOptions,
  titleOfLabel,
} from "../messages";
import type { TableEditing } from "./EditableSectionCell";
import type { ExperimentRow } from "./model/rows";

type Props = {
  row: ExperimentRow;
  width: number;
  selected: boolean;
  sharesRef: boolean;
  /** Whether this cell holds the grid's one tab stop (ADR-0043 point 5). */
  tabbable: boolean;
  editing: TableEditing;
  onSelect: (row: ExperimentRow) => void;
};

/**
 * The Experiment column's cell: ref and title, status, dates and flags
 * (FR-TBL-01), with the title and status edited in place (FR-TBL-11).
 * Status saves as soon as it is chosen. The title opens as a text box on
 * double-click or F2, after any open section editor has saved and closed; it
 * saves on Enter or on leaving the cell, is left as it was on Escape, and
 * stays open when refused so it can be corrected. A read-only project or
 * experiment shows both as plain text (spec P6, AGENTS.md rule 5).
 */
export function ExperimentCell({
  row,
  width,
  selected,
  sharesRef,
  tabbable,
  editing,
  onSelect,
}: Props) {
  const front = row.item.experiment.file.frontmatter;
  const canEdit = editing.writable && !row.item.readOnly;
  // The title being typed, or `null` while not renaming. Mirrored in a ref
  // so a blur arriving as the box closes sees that it already has.
  const [draft, setDraftState] = useState<string | null>(null);
  const draftRef = useRef<string | null>(null);
  const setDraft = (value: string | null) => {
    draftRef.current = value;
    setDraftState(value);
  };
  const saving = useRef(false);
  const returnFocus = useRef(false);
  const cellRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const renaming = draft !== null;

  useEffect(() => {
    if (renaming) {
      inputRef.current?.focus();
      inputRef.current?.select();
    } else if (returnFocus.current) {
      returnFocus.current = false;
      titleRef.current?.focus();
    }
  }, [renaming]);

  function startRename() {
    if (!canEdit) return;
    void editing.live.activate(null).then((closed) => {
      if (closed) setDraft(front.title);
    });
  }

  function finish(focusTitle: boolean) {
    returnFocus.current = focusTitle;
    setDraft(null);
  }

  function commit(focusTitle: boolean) {
    const title = draftRef.current;
    if (title === null || saving.current) return;
    if (title.trim() === front.title) {
      finish(focusTitle);
      return;
    }
    saving.current = true;
    void editing.onEditExperiment(front.id, { title }).then((saved) => {
      saving.current = false;
      if (saved) finish(focusTitle);
    });
  }

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
      ref={cellRef}
      role="gridcell"
      data-grid-row={row.key}
      data-grid-col={0}
      className="wtable__cell"
      style={{ width }}
    >
      {renaming ? (
        <input
          ref={inputRef}
          className="wtable__title-input"
          aria-label={titleOfLabel(front.ref)}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit(true);
            } else if (event.key === "Escape") {
              event.preventDefault();
              finish(true);
            }
          }}
          onBlur={(event) => {
            const to = event.relatedTarget;
            if (to instanceof Node && cellRef.current?.contains(to)) return;
            commit(false);
          }}
        />
      ) : (
        <button
          ref={titleRef}
          type="button"
          tabIndex={tabbable ? 0 : -1}
          data-grid-focus
          className="wtable__select"
          aria-pressed={selected}
          aria-label={selectLabel(front.ref)}
          title={canEdit ? renameHint : undefined}
          onClick={() => onSelect(row)}
          onDoubleClick={startRename}
          onKeyDown={(event) => {
            if (event.key === "F2") {
              event.preventDefault();
              startRename();
            }
          }}
        >
          <strong>{front.ref}</strong> {front.title}
        </button>
      )}
      <div>
        {canEdit ? (
          <select
            className="wtable__status wtable__status-select"
            aria-label={statusOfLabel(front.ref)}
            tabIndex={renaming ? 0 : -1}
            value={front.status}
            onChange={(event) => {
              const chosen = statusOptions.find(
                (s) => s === event.target.value,
              );
              if (chosen !== undefined && chosen !== front.status) {
                void editing.onEditExperiment(front.id, { status: chosen });
              }
            }}
          >
            {statusOptions.map((option) => (
              <option key={option} value={option}>
                {statusLabel(option)}
              </option>
            ))}
          </select>
        ) : (
          <span className="wtable__status">{statusLabel(front.status)}</span>
        )}
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
  );
}
