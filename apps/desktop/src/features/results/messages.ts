import type { NotebookError } from "@research-notebook/format";
import { assertNever } from "../../shared/assertNever";
import type { MenuLabel, PickMode } from "./model/menu";

const plural = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

/** User-facing text for the Results tree, in British English (AGENTS.md section 5). */
export const resultsMessages = {
  treeLabel: "Result groups",
  ungrouped: "Ungrouped",
  help: "Use the arrow keys to move through groups, and Enter for actions. Alt+Up and Alt+Down reorder. Drag to move an artefact; hold Ctrl (Option on macOS) while dropping to add it instead.",
  readOnly: "This project is read-only, so groups cannot be changed.",
  newGroupLabel: "New group",
  newGroupPlaceholder: "For example, Main figures",
  create: "Create",
  save: "Save",
  cancel: "Cancel",
  close: "Close",
  renameLabel: "Group name",
  subgroupLabel: "New subgroup name",
  actionsFor: (name: string) => `Actions for ${name}`,
  counts: (items: number, groups: number) =>
    groups === 0
      ? plural(items, "artefact", "artefacts")
      : `${plural(items, "artefact", "artefacts")}, ${plural(groups, "group", "groups")}`,
  menu: {
    moveTo: "Move to group…",
    addTo: "Add to group…",
    moveUp: "Move up",
    moveDown: "Move down",
    remove: "Remove from this group",
    rename: "Rename",
    newSubgroup: "New subgroup",
    moveToTop: "Move to top level",
    moveInto: "Move into group…",
    delete: "Delete group",
  } satisfies Record<MenuLabel, string>,
  pick: {
    moveTo: "Move to which group?",
    addTo: "Add to which group?",
    moveInto: "Move into which group?",
  } satisfies Record<PickMode, string>,
  confirmDelete: (
    name: string,
    summary: { groups: number; memberships: number },
  ) => {
    const inside =
      summary.groups === 0
        ? ""
        : ` and the ${plural(summary.groups, "group", "groups")} inside it`;
    return `Delete the group “${name}”${inside}? ${plural(summary.memberships, "membership is", "memberships are")} removed. No artefact or file is deleted.`;
  },
  deleteGroup: "Delete group",
};

/** Refusals from `packages/format`, by the field it named. */
const invalidMessages: Readonly<Record<string, string>> = {
  items:
    "That artefact is already in that group, or is no longer in the group it was in. Nothing was changed.",
  role: "Method artefacts cannot be put in groups. Nothing was changed.",
  groups:
    "A group needs a one-line name and cannot be put inside itself. Nothing was changed.",
};

/** Why a group change was refused. Nothing was written for it. */
export function refusalMessage(error: NotebookError): string {
  switch (error.kind) {
    case "notFound":
      return `That ${error.entity} no longer exists. Nothing was changed.`;
    case "invalid":
      return (
        invalidMessages[error.field ?? ""] ??
        "That change is not allowed. Nothing was changed."
      );
    default:
      return assertNever(error);
  }
}
