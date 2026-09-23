import type { ArtefactsFileModel } from "@research-notebook/format";
import type { GroupAction } from "./actions";
import { stepAction } from "./keys";
import {
  findGroup,
  groupTargets,
  subtreeIds,
  type GroupTarget,
  type TreeRow,
} from "./tree";

/** Pickers that ask which group: Move to and Add to for an item, Move into for a group. */
export type PickMode = "moveTo" | "addTo" | "moveInto";

/** What choosing a menu entry does. */
export type MenuRun =
  | { kind: "action"; action: GroupAction }
  | { kind: "pick"; mode: PickMode; targets: GroupTarget[] }
  | { kind: "rename" }
  | { kind: "newSubgroup" }
  | { kind: "confirmDelete" };

export type MenuLabel =
  | PickMode
  | "moveUp"
  | "moveDown"
  | "remove"
  | "rename"
  | "newSubgroup"
  | "moveToTop"
  | "delete";

export type MenuEntry = { label: MenuLabel; run: MenuRun };

function step(row: TreeRow, delta: -1 | 1): MenuEntry[] {
  const action = stepAction(row, delta);
  if (action === null) return [];
  return [
    {
      label: delta < 0 ? "moveUp" : "moveDown",
      run: { kind: "action", action },
    },
  ];
}

function pick(mode: PickMode, targets: GroupTarget[]): MenuEntry[] {
  return targets.length === 0
    ? []
    : [{ label: mode, run: { kind: "pick", mode, targets } }];
}

/**
 * The actions menu of a row (FR-GRP-01, FR-GRP-02): the same operations
 * drag and the keyboard give, reachable from one place. Pickers offer only
 * groups the operation can use, so an artefact is never offered a group
 * that already holds it (FR-GRP-03).
 */
export function rowMenu(file: ArtefactsFileModel, row: TreeRow): MenuEntry[] {
  const all = groupTargets(file);
  if (row.kind === "ungrouped") return [];
  if (row.kind === "item") {
    const free = all.filter(
      (target) =>
        !(findGroup(file.groups, target.id)?.items ?? []).includes(
          row.artefactId,
        ),
    );
    const remove: MenuEntry[] =
      row.group === null
        ? []
        : [
            {
              label: "remove",
              run: {
                kind: "action",
                action: {
                  kind: "removeFromGroup",
                  artefactId: row.artefactId,
                  groupId: row.group,
                },
              },
            },
          ];
    return [
      ...pick("moveTo", free),
      ...pick("addTo", free),
      ...step(row, -1),
      ...step(row, 1),
      ...remove,
    ];
  }
  const self = findGroup(file.groups, row.id);
  const inside = new Set(self === undefined ? [row.id] : subtreeIds(self));
  const into = all.filter((t) => !inside.has(t.id) && t.id !== row.parent);
  const toTop: MenuEntry[] =
    row.parent === null
      ? []
      : [
          {
            label: "moveToTop",
            run: {
              kind: "action",
              action: { kind: "moveGroup", groupId: row.id, parent: null },
            },
          },
        ];
  return [
    { label: "newSubgroup", run: { kind: "newSubgroup" } },
    { label: "rename", run: { kind: "rename" } },
    ...step(row, -1),
    ...step(row, 1),
    ...toTop,
    ...pick("moveInto", into),
    { label: "delete", run: { kind: "confirmDelete" } },
  ];
}

/** The action for choosing group `target` in a picker opened from `row`; `null` if it does not apply. */
export function pickedAction(
  row: TreeRow,
  mode: PickMode,
  target: string,
): GroupAction | null {
  if (row.kind === "item" && mode === "moveTo") {
    return {
      kind: "moveToGroup",
      artefactId: row.artefactId,
      from: row.group,
      to: target,
    };
  }
  if (row.kind === "item" && mode === "addTo") {
    return { kind: "addToGroup", artefactId: row.artefactId, groupId: target };
  }
  if (row.kind === "group" && mode === "moveInto") {
    return { kind: "moveGroup", groupId: row.id, parent: target };
  }
  return null;
}
