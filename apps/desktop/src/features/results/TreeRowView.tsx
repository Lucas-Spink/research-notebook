import { useState } from "react";
import { ArtefactTypeIcon, FolderIcon } from "../../shared/ArtefactTypeIcon";
import { classificationLabel, resultsMessages } from "./messages";
import { hasChildren, type TreeRow } from "./model/tree";
import type { ResultsTreeState } from "./useResultsTree";

type Props = {
  row: TreeRow;
  /** Position among the rows at its level, from 1, for `aria-posinset`. */
  position: number;
  setSize: number;
  tabbable: boolean;
  disabled: boolean;
  tree: ResultsTreeState;
  /** This result's linked file cannot be found. */
  missing: boolean;
};

function label(row: TreeRow): string {
  return row.kind === "ungrouped" ? resultsMessages.ungrouped : row.name;
}

function counts(row: TreeRow): string | null {
  if (row.kind === "group") {
    return resultsMessages.counts(row.itemCount, row.groupCount);
  }
  if (row.kind === "ungrouped") return resultsMessages.counts(row.itemCount, 0);
  return null;
}

/**
 * One row of the Results tree, as an ARIA `treeitem` with its level and
 * position so a flat list reads as a tree. Groups show their counts, open
 * or closed (FR-GRP-06). Rows can be dragged unless the project is
 * read-only; the Ungrouped header is a drop target only.
 */
export function TreeRowView({
  row,
  position,
  setSize,
  tabbable,
  disabled,
  tree,
  missing,
}: Props) {
  const expandable = row.kind !== "item" && hasChildren(row);
  const count = counts(row);
  // A group or the Ungrouped area being dragged over, so it shows it will take the drop.
  const [over, setOver] = useState(false);
  return (
    <li
      ref={(element) => {
        if (element === null) tree.rowRefs.current.delete(row.key);
        else tree.rowRefs.current.set(row.key, element);
      }}
      role="treeitem"
      className={`results__row results__row--${row.kind}${over ? " results__row--over" : ""}`}
      aria-level={row.depth}
      aria-posinset={position}
      aria-setsize={setSize}
      aria-expanded={expandable ? row.expanded : undefined}
      tabIndex={tabbable ? 0 : -1}
      style={{ paddingInlineStart: `${row.depth - 1}rem` }}
      draggable={!disabled && row.kind !== "ungrouped"}
      onKeyDown={(event) => tree.onKeyDown(row, event)}
      onFocus={() => tree.noteFocus(row.key)}
      onClick={() => {
        if (expandable) tree.toggle(row.key, !row.expanded);
      }}
      onDoubleClick={() => {
        if (row.kind === "item") tree.open?.(row.artefactId);
      }}
      onContextMenu={(event) => {
        if (disabled || row.kind === "ungrouped") return;
        event.preventDefault();
        tree.setPanel({ kind: "menu", row });
      }}
      onDragStart={(event) => tree.drag.start(row, event)}
      onDragOver={(event) => tree.drag.over(row, event)}
      onDragEnter={() => row.kind !== "item" && setOver(true)}
      onDragLeave={(event) => {
        // Moving onto a child of the row is still over the row.
        const to = event.relatedTarget;
        if (!(to instanceof Node) || !event.currentTarget.contains(to))
          setOver(false);
      }}
      onDrop={(event) => {
        setOver(false);
        tree.drag.drop(row, event);
      }}
      onDragEnd={() => {
        setOver(false);
        tree.drag.end();
      }}
    >
      {expandable && (
        <span className="results__toggle" aria-hidden="true">
          {row.expanded ? "▾" : "▸"}
        </span>
      )}
      {row.kind !== "item" && (
        <span className="results__icon results__icon--folder">
          <FolderIcon />
        </span>
      )}
      <span className="results__name-text">{label(row)}</span>
      {row.kind === "item" && (
        <span className="results__icon" title={row.artefactType}>
          <ArtefactTypeIcon type={row.artefactType} />
        </span>
      )}
      {missing && (
        <span
          className="results__badge results__badge--missing"
          title={resultsMessages.missingHint}
        >
          <span aria-hidden="true">⚠ </span>
          {resultsMessages.missing}
        </span>
      )}
      {row.kind === "item" && row.classification !== null && (
        <span
          className={`results__badge${row.classification === "main_figure" ? " results__badge--main" : ""}`}
        >
          {classificationLabel(row.classification)}
        </span>
      )}
      {count !== null && <span className="results__count">{count}</span>}
      {!disabled && row.kind !== "ungrouped" && (
        <button
          type="button"
          className="results__actions"
          tabIndex={-1}
          aria-label={resultsMessages.actionsFor(label(row))}
          title={resultsMessages.actionsHint}
          onClick={(event) => {
            event.stopPropagation();
            tree.setPanel({ kind: "menu", row });
          }}
          onDoubleClick={(event) => event.stopPropagation()}
        >
          <span className="results__actions-dots" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}
