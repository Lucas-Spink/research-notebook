import type { ArtefactsFileModel } from "@research-notebook/format";
import type { GroupAction } from "./actions";
import { findGroup, type TreeRow } from "./tree";

/** An artefact's row, which is what a selection is made of. */
export type ItemRow = Extract<TreeRow, { kind: "item" }>;

/** Row keys the person has chosen; only item rows can be chosen. */
export type Selection = ReadonlySet<string>;

/** `selection` with `key` added, or removed if it was there. */
export function toggled(selection: Selection, key: string): Selection {
  const next = new Set(selection);
  if (!next.delete(key)) next.add(key);
  return next;
}

/**
 * Every item row between `anchor` and `key`, in the order shown, added to
 * `selection`. Group rows between them are passed over. With no anchor
 * on screen, only `key` is chosen.
 */
export function ranged(
  rows: readonly TreeRow[],
  selection: Selection,
  anchor: string | null,
  key: string,
): Selection {
  const from = rows.findIndex((row) => row.key === anchor);
  const to = rows.findIndex((row) => row.key === key);
  if (to < 0) return selection;
  const [start, end] =
    from < 0 ? [to, to] : [Math.min(from, to), Math.max(from, to)];
  const next = new Set(selection);
  for (const row of rows.slice(start, end + 1)) {
    if (row.kind === "item") next.add(row.key);
  }
  return next;
}

/** The chosen item rows that are still on screen, in the order shown. */
export function selectedRows(
  rows: readonly TreeRow[],
  selection: Selection,
): ItemRow[] {
  return rows.filter(
    (row): row is ItemRow => row.kind === "item" && selection.has(row.key),
  );
}

/**
 * One action for the whole selection, or `null` when there is nothing to
 * do. Items for which the step would be refused (already in the target
 * group, or not in a group to leave) are left out rather than stopping the
 * rest, so a mixed selection still moves what can move.
 */
export function batchAction(
  file: ArtefactsFileModel,
  items: readonly ItemRow[],
  mode: "moveTo" | "addTo",
  target: string,
): GroupAction | null {
  const held = new Set(findGroup(file.groups, target)?.items ?? []);
  const seen = new Set<string>();
  const actions: GroupAction[] = [];
  for (const item of items) {
    // An artefact in two selected rows is moved or added once.
    if (held.has(item.artefactId) || seen.has(item.artefactId)) continue;
    seen.add(item.artefactId);
    actions.push(
      mode === "addTo"
        ? { kind: "addToGroup", artefactId: item.artefactId, groupId: target }
        : {
            kind: "moveToGroup",
            artefactId: item.artefactId,
            from: item.group,
            to: target,
          },
    );
  }
  return actions.length === 0 ? null : { kind: "batch", actions };
}

/** Takes every chosen item out of the group it is shown in; `null` if none is in a group. */
export function batchRemove(items: readonly ItemRow[]): GroupAction | null {
  const actions = items.flatMap((item): GroupAction[] =>
    item.group === null
      ? []
      : [
          {
            kind: "removeFromGroup",
            artefactId: item.artefactId,
            groupId: item.group,
          },
        ],
  );
  return actions.length === 0 ? null : { kind: "batch", actions };
}
