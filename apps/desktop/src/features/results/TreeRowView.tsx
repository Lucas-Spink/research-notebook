import { useState } from "react";
import { FileIcon, GroupFolderIcon } from "../../shared/FileIcons";
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
  /** Hovering a result: its id and row, or `null` when the pointer leaves. */
  onHover?: (artefactId: string | null, row?: HTMLElement) => void;
};

function label(row: TreeRow): string {
  return row.kind === "ungrouped" ? resultsMessages.ungrouped : row.name;
}

/** What is in a folder, written out for the tooltip and screen readers. */
function countsText(row: TreeRow): string | null {
  if (row.kind === "group") {
    return resultsMessages.counts(row.itemCount, row.groupCount);
  }
  if (row.kind === "ungrouped") return resultsMessages.counts(row.itemCount, 0);
  return null;
}

/** The number shown beside a folder: the artefacts and folders directly in it. */
function countShown(row: TreeRow): number | null {
  if (row.kind === "group") return row.itemCount + row.groupCount;
  if (row.kind === "ungrouped") return row.itemCount;
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
  onHover,
}: Props) {
  const expandable = row.kind !== "item" && hasChildren(row);
  const count = countShown(row);
  const chosen =
    row.kind === "item" && tree.chosen.some((c) => c.key === row.key);
  // A group or the Ungrouped area being dragged over, so it shows it will take the drop.
  const [over, setOver] = useState(false);
  return (
    <li
      ref={(element) => {
        if (element === null) tree.rowRefs.current.delete(row.key);
        else tree.rowRefs.current.set(row.key, element);
      }}
      role="treeitem"
      className={`results__row results__row--${row.kind}${over ? " results__row--over" : ""}${chosen ? " results__row--chosen" : ""}`}
      aria-selected={row.kind === "item" ? chosen : undefined}
      aria-level={row.depth}
      aria-posinset={position}
      aria-setsize={setSize}
      aria-expanded={expandable ? row.expanded : undefined}
      tabIndex={tabbable ? 0 : -1}
      style={{ paddingInlineStart: `${4 + (row.depth - 1) * 14}px` }}
      draggable={!disabled && row.kind !== "ungrouped"}
      onKeyDown={(event) => tree.onKeyDown(row, event)}
      onFocus={() => tree.noteFocus(row.key)}
      onClick={(event) => {
        tree.choose(row, {
          ctrl: event.ctrlKey || event.metaKey,
          shift: event.shiftKey,
        });
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
      onMouseEnter={(event) => {
        if (row.kind === "item") onHover?.(row.artefactId, event.currentTarget);
      }}
      onMouseLeave={() => {
        if (row.kind === "item") onHover?.(null);
      }}
      onDragStart={(event) => {
        onHover?.(null);
        tree.drag.start(row, event);
      }}
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
      <span className="results__toggle" aria-hidden="true">
        {expandable ? (row.expanded ? "▾" : "▸") : ""}
      </span>
      {row.kind === "item" ? (
        <span className="results__icon" title={row.artefactType}>
          <FileIcon name={row.name} type={row.artefactType} />
        </span>
      ) : (
        <span className="results__icon">
          <GroupFolderIcon open={row.expanded && hasChildren(row)} />
        </span>
      )}
      <span className="results__name-text" title={label(row)}>
        {label(row)}
      </span>
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
      {count !== null && (
        <span className="results__count" title={countsText(row) ?? undefined}>
          {count}
        </span>
      )}
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
