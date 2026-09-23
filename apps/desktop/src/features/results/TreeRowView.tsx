import { resultsMessages } from "./messages";
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
}: Props) {
  const expandable = row.kind !== "item" && hasChildren(row);
  const count = counts(row);
  return (
    <li
      ref={(element) => {
        if (element === null) tree.rowRefs.current.delete(row.key);
        else tree.rowRefs.current.set(row.key, element);
      }}
      role="treeitem"
      className={`results__row results__row--${row.kind}`}
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
      onContextMenu={(event) => {
        if (disabled || row.kind === "ungrouped") return;
        event.preventDefault();
        tree.setPanel({ kind: "menu", row });
      }}
      onDragStart={(event) => tree.drag.start(row, event)}
      onDragOver={(event) => tree.drag.over(row, event)}
      onDrop={(event) => tree.drag.drop(row, event)}
      onDragEnd={() => tree.drag.end()}
    >
      {expandable && (
        <span className="results__toggle" aria-hidden="true">
          {row.expanded ? "▾" : "▸"}
        </span>
      )}
      <span className="results__name-text">{label(row)}</span>
      {count !== null && <span className="results__count">{count}</span>}
    </li>
  );
}
