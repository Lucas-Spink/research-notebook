import {
  ungroupedArtefacts,
  type ArtefactsFileModel,
  type GroupModel,
} from "@research-notebook/format";

/** Groups holding more items than this start collapsed (FR-GRP-06). */
export const COLLAPSE_ABOVE = 50;

export const UNGROUPED_KEY = "ungrouped";

/** Rows the person opened or closed, by row key; others follow the default. */
export type Expansion = Readonly<Record<string, boolean>>;

type Base = {
  /** Unique among the rows: an artefact in two groups has two rows. */
  key: string;
  /** From 1, as `aria-level`. */
  depth: number;
  parentKey: string | null;
};

export type GroupRow = Base & {
  kind: "group";
  id: string;
  name: string;
  parent: string | null;
  /** Position among its sibling groups. */
  index: number;
  siblings: number;
  itemCount: number;
  groupCount: number;
  expanded: boolean;
};

export type UngroupedRow = Base & {
  kind: "ungrouped";
  itemCount: number;
  expanded: boolean;
};

export type ItemRow = Base & {
  kind: "item";
  artefactId: string;
  name: string;
  /** The group this row shows the artefact in; `null`: the Ungrouped area. */
  group: string | null;
  index: number;
  siblings: number;
};

export type TreeRow = GroupRow | UngroupedRow | ItemRow;

/** A group offered as a destination in a picker, indented by `depth`. */
export type GroupTarget = { id: string; name: string; depth: number };

export const groupKey = (id: string) => `g:${id}`;

function isExpanded(key: string, itemCount: number, expansion: Expansion) {
  return expansion[key] ?? itemCount <= COLLAPSE_ABOVE;
}

/**
 * The visible rows of the Results tree, in order: each group's subgroups,
 * then its items; after all groups, the Ungrouped area (FR-GRP-05). Rows
 * inside a collapsed group are left out, so a large tree stays cheap to
 * render (NFR-PERF-04).
 */
export function treeRows(
  file: ArtefactsFileModel,
  expansion: Expansion,
): TreeRow[] {
  const names = new Map(file.artefacts.map((a) => [a.id, a.name] as const));
  const rows: TreeRow[] = [];
  const items = (
    ids: readonly string[],
    group: string | null,
    parentKey: string,
    depth: number,
  ) => {
    ids.forEach((artefactId, index) => {
      rows.push({
        kind: "item",
        key: `i:${group ?? UNGROUPED_KEY}:${artefactId}`,
        depth,
        parentKey,
        artefactId,
        name: names.get(artefactId) ?? artefactId,
        group,
        index,
        siblings: ids.length,
      });
    });
  };
  const visit = (
    groups: readonly GroupModel[],
    parent: string | null,
    depth: number,
  ) => {
    groups.forEach((group, index) => {
      const key = groupKey(group.id);
      const expanded = isExpanded(key, group.items.length, expansion);
      rows.push({
        kind: "group",
        key,
        depth,
        parentKey: parent === null ? null : groupKey(parent),
        id: group.id,
        name: group.name,
        parent,
        index,
        siblings: groups.length,
        itemCount: group.items.length,
        groupCount: group.groups.length,
        expanded,
      });
      if (!expanded) return;
      visit(group.groups, group.id, depth + 1);
      items(group.items, group.id, key, depth + 1);
    });
  };
  visit(file.groups, null, 1);

  const ungrouped = ungroupedArtefacts(file).map((a) => a.id);
  const expanded = isExpanded(UNGROUPED_KEY, ungrouped.length, expansion);
  rows.push({
    kind: "ungrouped",
    key: UNGROUPED_KEY,
    depth: 1,
    parentKey: null,
    itemCount: ungrouped.length,
    expanded,
  });
  if (expanded) items(ungrouped, null, UNGROUPED_KEY, 2);
  return rows;
}

/** Whether a row has anything to open: a group or the Ungrouped area that is not empty. */
export function hasChildren(row: TreeRow): boolean {
  if (row.kind === "group") return row.itemCount + row.groupCount > 0;
  return row.kind === "ungrouped" && row.itemCount > 0;
}

/**
 * Each row's place among the rows that share its parent, from 1, for
 * `aria-posinset` and `aria-setsize`: subgroups and items are siblings.
 */
export function positions(
  rows: readonly TreeRow[],
): Map<string, { position: number; setSize: number }> {
  const sizes = new Map<string | null, number>();
  for (const row of rows) {
    sizes.set(row.parentKey, (sizes.get(row.parentKey) ?? 0) + 1);
  }
  const seen = new Map<string | null, number>();
  const found = new Map<string, { position: number; setSize: number }>();
  for (const row of rows) {
    const position = (seen.get(row.parentKey) ?? 0) + 1;
    seen.set(row.parentKey, position);
    found.set(row.key, { position, setSize: sizes.get(row.parentKey) ?? 0 });
  }
  return found;
}

/** Every group, in tree order, for the Move to and Add to pickers. */
export function groupTargets(file: ArtefactsFileModel): GroupTarget[] {
  const targets: GroupTarget[] = [];
  const visit = (groups: readonly GroupModel[], depth: number) => {
    for (const group of groups) {
      targets.push({ id: group.id, name: group.name, depth });
      visit(group.groups, depth + 1);
    }
  };
  visit(file.groups, 1);
  return targets;
}

/** The group `id` with its subgroups, or `undefined`. */
export function findGroup(
  groups: readonly GroupModel[],
  id: string,
): GroupModel | undefined {
  for (const group of groups) {
    if (group.id === id) return group;
    const found = findGroup(group.groups, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** The ids of `group` and every group inside it. */
export function subtreeIds(group: GroupModel): string[] {
  return [group.id, ...group.groups.flatMap(subtreeIds)];
}

/** What deleting a group takes away, for its confirmation: groups inside it and memberships. */
export function deletionSummary(
  file: ArtefactsFileModel,
  groupId: string,
): { groups: number; memberships: number } {
  const group = findGroup(file.groups, groupId);
  if (group === undefined) return { groups: 0, memberships: 0 };
  const count = (node: GroupModel): { groups: number; memberships: number } =>
    node.groups.map(count).reduce(
      (sum, child) => ({
        groups: sum.groups + child.groups + 1,
        memberships: sum.memberships + child.memberships,
      }),
      { groups: 0, memberships: node.items.length },
    );
  return count(group);
}
