import type { GroupAction } from "./actions";
import { hasChildren, type TreeRow } from "./tree";

/** Where a navigation key leads: another row, or opening or closing this one. */
export type Navigation =
  { focus: string } | { expand: string; expanded: boolean };

/** What a key asks of the focused row, beyond moving around the tree. */
export type RowCommand =
  | { kind: "action"; action: GroupAction }
  | { kind: "menu" }
  | { kind: "rename" }
  | { kind: "confirmDelete" };

export type KeyPress = { key: string; altKey: boolean; shiftKey: boolean };

const focusAt = (rows: readonly TreeRow[], index: number) => {
  const row = rows[index];
  return row === undefined ? null : { focus: row.key };
};

/**
 * The ARIA treeview keys: Up and Down, Home and End, Right to open or enter
 * a group, Left to close it or go to its parent. `null`: nothing to do.
 */
export function navigate(
  rows: readonly TreeRow[],
  focus: string | null,
  key: string,
): Navigation | null {
  const at = rows.findIndex((row) => row.key === focus);
  const row = rows[at];
  if (row === undefined) return focusAt(rows, 0);
  switch (key) {
    case "ArrowDown":
      return focusAt(rows, at + 1);
    case "ArrowUp":
      return focusAt(rows, at - 1);
    case "Home":
      return focusAt(rows, 0);
    case "End":
      return focusAt(rows, rows.length - 1);
    case "ArrowRight":
      if (!hasChildren(row) || row.kind === "item") return null;
      return row.expanded
        ? focusAt(rows, at + 1)
        : { expand: row.key, expanded: true };
    case "ArrowLeft":
      if (row.kind !== "item" && row.expanded && hasChildren(row)) {
        return { expand: row.key, expanded: false };
      }
      return row.parentKey === null ? null : { focus: row.parentKey };
    default:
      return null;
  }
}

/** Moves a row one place up (`-1`) or down (`1`) among its siblings, if it can go. */
export function stepAction(row: TreeRow, delta: -1 | 1): GroupAction | null {
  if (row.kind === "ungrouped") return null;
  const index = row.index + delta;
  if (index < 0 || index >= row.siblings) return null;
  if (row.kind === "group") {
    return { kind: "moveGroup", groupId: row.id, parent: row.parent, index };
  }
  if (row.group === null) return null;
  return {
    kind: "reorderItem",
    groupId: row.group,
    artefactId: row.artefactId,
    index,
  };
}

/**
 * Keyboard access to every group operation (spec 10.2): Enter, Shift+F10 or
 * the context menu key open the row's actions, where Move to and Add to
 * live; Alt+Up and Alt+Down reorder; F2 renames; Delete removes a
 * membership, or asks before deleting a group.
 */
export function rowCommand(row: TreeRow, press: KeyPress): RowCommand | null {
  const action = (found: GroupAction | null): RowCommand | null =>
    found === null ? null : { kind: "action", action: found };
  if (press.altKey && press.key === "ArrowUp")
    return action(stepAction(row, -1));
  if (press.altKey && press.key === "ArrowDown")
    return action(stepAction(row, 1));
  if (row.kind === "ungrouped") return null;
  if (
    press.key === "Enter" ||
    press.key === "ContextMenu" ||
    (press.shiftKey && press.key === "F10")
  ) {
    return { kind: "menu" };
  }
  if (row.kind === "group") {
    if (press.key === "F2") return { kind: "rename" };
    if (press.key === "Delete") return { kind: "confirmDelete" };
    return null;
  }
  if (press.key === "Delete" && row.group !== null) {
    return action({
      kind: "removeFromGroup",
      artefactId: row.artefactId,
      groupId: row.group,
    });
  }
  return null;
}
