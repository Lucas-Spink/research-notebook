import { fail, ok, type Result } from "../result";
import {
  ArtefactsFile,
  type ArtefactModel,
  type ArtefactsFileModel,
  type GroupModel,
} from "../schema";
import { invalid } from "./project-edit";
import type { NotebookEnv, NotebookError } from "./types";
import { refusal } from "./util";

/*
 * The virtual group tree of spec 7.5 (FR-GRP-01 to FR-GRP-05, ADR-0036).
 * Every operation changes `groups` only: `artefacts` is carried over as the
 * same objects, so no artefact, version or file is ever touched. Positions
 * are clamped into range; `undefined` means the end.
 */

type Groups = readonly GroupModel[];
type Changed = Result<ArtefactsFileModel, NotebookError>;

const missingGroup = (id: string): NotebookError => ({
  kind: "notFound",
  entity: "group",
  id,
});

function findGroup(groups: Groups, id: string): GroupModel | undefined {
  for (const group of groups) {
    if (group.id === id) return group;
    const found = findGroup(group.groups, id);
    if (found !== undefined) return found;
  }
  return undefined;
}

function updateGroup(
  groups: Groups,
  id: string,
  change: (group: GroupModel) => GroupModel,
): GroupModel[] {
  return groups.map((group) =>
    group.id === id
      ? change(group)
      : { ...group, groups: updateGroup(group.groups, id, change) },
  );
}

function withoutGroup(groups: Groups, id: string): GroupModel[] {
  return groups
    .filter((group) => group.id !== id)
    .map((group) => ({ ...group, groups: withoutGroup(group.groups, id) }));
}

function insertAt<T>(list: readonly T[], index: number | undefined, value: T) {
  const at =
    index === undefined
      ? list.length
      : Math.max(0, Math.min(index, list.length));
  return [...list.slice(0, at), value, ...list.slice(at)];
}

function insertGroup(
  groups: Groups,
  parent: string | null,
  index: number | undefined,
  node: GroupModel,
): GroupModel[] {
  if (parent === null) return insertAt(groups, index, node);
  return updateGroup(groups, parent, (group) => ({
    ...group,
    groups: insertAt(group.groups, index, node),
  }));
}

/** Validates the changed tree the way the file is read, so nothing invalid is ever written. */
function checked(file: ArtefactsFileModel, groups: GroupModel[]): Changed {
  const result = ArtefactsFile.safeParse({ ...file, groups });
  return result.success ? ok(result.data) : fail(refusal(result.error));
}

/** A new, empty group named `name`, at the end of `parent`'s groups or the top level (FR-GRP-01). */
export function createGroup(
  file: ArtefactsFileModel,
  input: { name: string; parent: string | null; index?: number },
  env: NotebookEnv,
): Result<{ file: ArtefactsFileModel; groupId: string }, NotebookError> {
  const { parent } = input;
  if (parent !== null && findGroup(file.groups, parent) === undefined) {
    return fail(missingGroup(parent));
  }
  const groupId = env.newId();
  const node = { id: groupId, name: input.name.trim(), items: [], groups: [] };
  const result = checked(
    file,
    insertGroup(file.groups, parent, input.index, node),
  );
  return result.ok ? ok({ file: result.value, groupId }) : result;
}

/** Renames a group, keeping everything else it holds (FR-GRP-01). */
export function renameGroup(
  file: ArtefactsFileModel,
  groupId: string,
  name: string,
): Changed {
  if (findGroup(file.groups, groupId) === undefined) {
    return fail(missingGroup(groupId));
  }
  return checked(
    file,
    updateGroup(file.groups, groupId, (group) => ({
      ...group,
      name: name.trim(),
    })),
  );
}

/**
 * Moves a group with everything inside it to position `index` among
 * `parent`'s groups (`null`: the top level). This both nests and reorders
 * (FR-GRP-01, FR-GRP-04). A group cannot go inside itself.
 */
export function moveGroup(
  file: ArtefactsFileModel,
  groupId: string,
  parent: string | null,
  index: number,
): Changed {
  const node = findGroup(file.groups, groupId);
  if (node === undefined) return fail(missingGroup(groupId));
  if (parent !== null) {
    if (findGroup(file.groups, parent) === undefined) {
      return fail(missingGroup(parent));
    }
    if (findGroup([node], parent) !== undefined) {
      return fail(invalid("a group cannot be moved inside itself", "groups"));
    }
  }
  const removed = withoutGroup(file.groups, groupId);
  return checked(file, insertGroup(removed, parent, index, node));
}

/**
 * Deletes a group and the groups inside it. Only memberships go: an
 * artefact left in no group shows as ungrouped (FR-GRP-01, FR-GRP-05).
 */
export function deleteGroup(
  file: ArtefactsFileModel,
  groupId: string,
): Changed {
  if (findGroup(file.groups, groupId) === undefined) {
    return fail(missingGroup(groupId));
  }
  return checked(file, withoutGroup(file.groups, groupId));
}

/** Finds a group that must hold, or must not hold, `artefactId`. */
function memberGroup(
  file: ArtefactsFileModel,
  groupId: string,
  artefactId: string,
  expected: boolean,
): Result<GroupModel, NotebookError> {
  const group = findGroup(file.groups, groupId);
  if (group === undefined) return fail(missingGroup(groupId));
  if (group.items.includes(artefactId) !== expected) {
    return fail(
      invalid(
        expected
          ? "the artefact is not in this group"
          : "the artefact is already in this group",
        "items",
      ),
    );
  }
  return ok(group);
}

function withItems(
  groups: Groups,
  groupId: string,
  items: (current: readonly string[]) => string[],
): GroupModel[] {
  return updateGroup(groups, groupId, (group) => ({
    ...group,
    items: items(group.items),
  }));
}

/**
 * Adds a membership, keeping every other one (Add to group, FR-GRP-02). An
 * artefact is never listed twice in one group (FR-GRP-03).
 */
export function addToGroup(
  file: ArtefactsFileModel,
  artefactId: string,
  groupId: string,
  index?: number,
): Changed {
  const artefact = file.artefacts.find((a) => a.id === artefactId);
  if (artefact === undefined) {
    return fail({ kind: "notFound", entity: "artefact", id: artefactId });
  }
  if (artefact.role !== "result") {
    return fail(invalid("method artefacts cannot be group members", "role"));
  }
  const target = memberGroup(file, groupId, artefactId, false);
  if (!target.ok) return target;
  return checked(
    file,
    withItems(file.groups, groupId, (items) =>
      insertAt(items, index, artefactId),
    ),
  );
}

/**
 * Moves a membership from group `from` to group `to` (Move to group,
 * FR-GRP-02). Other memberships stay. From `null`, the Ungrouped area, it
 * is the same as adding; within one group it is a reorder.
 */
export function moveToGroup(
  file: ArtefactsFileModel,
  artefactId: string,
  from: string | null,
  to: string,
  index?: number,
): Changed {
  if (from === null) return addToGroup(file, artefactId, to, index);
  if (from === to) {
    const size = findGroup(file.groups, to)?.items.length ?? 0;
    return reorderItem(file, to, artefactId, index ?? size);
  }
  const source = memberGroup(file, from, artefactId, true);
  if (!source.ok) return source;
  const target = memberGroup(file, to, artefactId, false);
  if (!target.ok) return target;
  const removed = withItems(file.groups, from, (items) =>
    items.filter((id) => id !== artefactId),
  );
  return checked(
    file,
    withItems(removed, to, (items) => insertAt(items, index, artefactId)),
  );
}

/** Removes one membership; the artefact itself stays (FR-GRP-01). */
export function removeFromGroup(
  file: ArtefactsFileModel,
  artefactId: string,
  groupId: string,
): Changed {
  const group = memberGroup(file, groupId, artefactId, true);
  if (!group.ok) return group;
  return checked(
    file,
    withItems(file.groups, groupId, (items) =>
      items.filter((id) => id !== artefactId),
    ),
  );
}

/** Moves an artefact to position `index` within a group it is in (FR-GRP-04). */
export function reorderItem(
  file: ArtefactsFileModel,
  groupId: string,
  artefactId: string,
  index: number,
): Changed {
  const group = memberGroup(file, groupId, artefactId, true);
  if (!group.ok) return group;
  return checked(
    file,
    withItems(file.groups, groupId, (items) =>
      insertAt(
        items.filter((id) => id !== artefactId),
        index,
        artefactId,
      ),
    ),
  );
}

/** Result artefacts in no group, in capture order: the Ungrouped area (FR-GRP-05). */
export function ungroupedArtefacts(file: ArtefactsFileModel): ArtefactModel[] {
  const members = new Set<string>();
  const collect = (groups: Groups): void => {
    for (const group of groups) {
      group.items.forEach((id) => members.add(id));
      collect(group.groups);
    }
  };
  collect(file.groups);
  return file.artefacts.filter(
    (artefact) => artefact.role === "result" && !members.has(artefact.id),
  );
}
