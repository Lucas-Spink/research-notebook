import {
  KNOWN_CLASSIFICATIONS,
  type ArtefactsFileModel,
} from "@research-notebook/format";
import type { GroupAction } from "./actions";
import { batchRemove, type ItemRow } from "./selection";
import { stepAction } from "./keys";
import {
  findGroup,
  groupTargets,
  hasChildren,
  subtreeIds,
  type GroupTarget,
  type TreeRow,
} from "./tree";

/** Pickers that ask which group: Move to and Add to for an item, Move into for a group. */
export type PickMode = "moveTo" | "addTo" | "moveInto" | "classify";

/** What choosing a menu entry does. */
export type MenuRun =
  | { kind: "action"; action: GroupAction }
  | { kind: "pick"; mode: PickMode; targets: GroupTarget[] }
  | { kind: "rename" }
  | { kind: "renameResult" }
  | { kind: "newSubgroup" }
  | { kind: "confirmDelete" }
  /** Opens or closes this group and everything in it; changes no data. */
  | { kind: "expandAll" | "collapseAll" }
  /** Opens the artefact's preview; changes nothing, so it is offered read-only too. */
  | { kind: "open"; artefactId: string }
  /** Shows what the file records about the artefact; changes nothing. */
  | { kind: "details" };

export type MenuLabel =
  | "preview"
  | "details"
  | "renameResult"
  | PickMode
  | "moveUp"
  | "moveDown"
  | "remove"
  | "markMainFigure"
  | "unmarkMainFigure"
  | "clearClassification"
  | "rename"
  | "newSubgroup"
  | "expandAll"
  | "collapseAll"
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

function classification(
  file: ArtefactsFileModel,
  row: Extract<TreeRow, { kind: "item" }>,
): MenuEntry[] {
  // A method cannot be classified, and only results are in the tree, but the
  // file is the authority, so a missing or method artefact offers nothing.
  const found = file.artefacts.find((a) => a.id === row.artefactId);
  if (found === undefined || found.role !== "result") return [];
  const set = (value: string | null): MenuRun => ({
    kind: "action",
    action: {
      kind: "setClassification",
      artefactId: row.artefactId,
      classification: value,
    },
  });
  const main = row.classification === "main_figure";
  const targets: GroupTarget[] = KNOWN_CLASSIFICATIONS.filter(
    (value) => value !== row.classification,
  ).map((value) => ({ id: value, name: value, depth: 1 }));
  return [
    main
      ? { label: "unmarkMainFigure", run: set(null) }
      : { label: "markMainFigure", run: set("main_figure") },
    ...pick("classify", targets),
    ...(row.classification === null || main
      ? []
      : [{ label: "clearClassification" as const, run: set(null) }]),
  ];
}

/**
 * The actions menu of a row (FR-GRP-01, FR-GRP-02): the same operations
 * drag and the keyboard give, reachable from one place. Pickers offer only
 * groups the operation can use, so an artefact is never offered a group
 * that already holds it (FR-GRP-03).
 */
export function rowMenu(
  file: ArtefactsFileModel,
  row: TreeRow,
  {
    canOpen = false,
    selected = [],
  }: { canOpen?: boolean; selected?: readonly ItemRow[] } = {},
): MenuEntry[] {
  const all = groupTargets(file);
  // Several chosen artefacts: only what makes sense for all of them at once.
  if (row.kind === "item" && selected.length > 1) {
    const remove = batchRemove(selected);
    return [
      ...pick("moveTo", all),
      ...pick("addTo", all),
      ...(remove === null
        ? []
        : [
            {
              label: "remove" as const,
              run: { kind: "action" as const, action: remove },
            },
          ]),
    ];
  }
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
    const details: MenuEntry[] = [
      { label: "details", run: { kind: "details" } },
    ];
    const preview: MenuEntry[] = canOpen
      ? [
          {
            label: "preview",
            run: { kind: "open", artefactId: row.artefactId },
          },
        ]
      : [];
    return [
      ...preview,
      ...details,
      { label: "renameResult", run: { kind: "renameResult" } },
      ...pick("moveTo", free),
      ...pick("addTo", free),
      ...classification(file, row),
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
    ...(hasChildren(row)
      ? [
          { label: "expandAll" as const, run: { kind: "expandAll" as const } },
          {
            label: "collapseAll" as const,
            run: { kind: "collapseAll" as const },
          },
        ]
      : []),
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
  if (row.kind === "item" && mode === "classify") {
    return {
      kind: "setClassification",
      artefactId: row.artefactId,
      classification: target,
    };
  }
  if (row.kind === "group" && mode === "moveInto") {
    return { kind: "moveGroup", groupId: row.id, parent: target };
  }
  return null;
}
