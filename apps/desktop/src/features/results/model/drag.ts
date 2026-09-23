import type { GroupAction } from "./actions";
import type { TreeRow } from "./tree";

/** What is being dragged: one row's artefact membership, or a group. */
export type Dragged =
  | {
      kind: "item";
      artefactId: string;
      /** `null`: dragged from the Ungrouped area. */
      from: string | null;
      /** Its position in `from`. */
      index: number;
    }
  | { kind: "group"; groupId: string };

/** The row that was dragged, as a `Dragged`, or `null` for the Ungrouped header. */
export function draggedFrom(row: TreeRow): Dragged | null {
  if (row.kind === "group") return { kind: "group", groupId: row.id };
  if (row.kind === "item") {
    return {
      kind: "item",
      artefactId: row.artefactId,
      from: row.group,
      index: row.index,
    };
  }
  return null;
}

function itemDrop(
  dragged: Extract<Dragged, { kind: "item" }>,
  to: string,
  index: number | undefined,
  copy: boolean,
): GroupAction | null {
  const { artefactId, from } = dragged;
  const at = index === undefined ? {} : { index };
  if (copy) return { kind: "addToGroup", artefactId, groupId: to, ...at };
  if (from === to) {
    // The item leaves its old place first, so a later place is one less.
    if (index === undefined) return null;
    const target = dragged.index < index ? index - 1 : index;
    if (target === dragged.index) return null;
    return { kind: "moveToGroup", artefactId, from, to, index: target };
  }
  return { kind: "moveToGroup", artefactId, from, to, ...at };
}

/**
 * What dropping `dragged` on `row` does (FR-GRP-02). An item dropped on a
 * group goes to its end, and on an item goes just before it. A plain drop
 * moves it out of the group it came from; with the copy key (Ctrl, or
 * Option on macOS) it is added and keeps its other memberships. Dropped on
 * the Ungrouped area, it leaves the group it came from. A group dropped on
 * another group is nested at its end. `null`: the drop is not allowed.
 */
export function dropAction(
  dragged: Dragged,
  row: TreeRow,
  copy: boolean,
): GroupAction | null {
  if (dragged.kind === "group") {
    if (row.kind !== "group" || row.id === dragged.groupId) return null;
    return { kind: "moveGroup", groupId: dragged.groupId, parent: row.id };
  }
  const intoUngrouped =
    row.kind === "ungrouped" || (row.kind === "item" && row.group === null);
  if (intoUngrouped) {
    if (copy || dragged.from === null) return null;
    return {
      kind: "removeFromGroup",
      artefactId: dragged.artefactId,
      groupId: dragged.from,
    };
  }
  if (row.kind === "group") {
    if (row.id === dragged.from) return null;
    return itemDrop(dragged, row.id, undefined, copy);
  }
  if (row.kind !== "item" || row.group === null) return null;
  return itemDrop(dragged, row.group, row.index, copy);
}
