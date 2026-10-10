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
  resultNameLabel: "Display name",
  resultNameNote: "Only the name shown here changes. The file is not renamed.",
  newGroupPlaceholder: "For example, Main figures",
  create: "Create",
  save: "Save",
  cancel: "Cancel",
  close: "Close",
  renameLabel: "Group name",
  subgroupLabel: "New subgroup name",
  actionsFor: (name: string) => `Actions for ${name}`,
  actionsHint: "Move, add to a group, preview…",
  counts: (items: number, groups: number) =>
    groups === 0
      ? plural(items, "artefact", "artefacts")
      : `${plural(items, "artefact", "artefacts")}, ${plural(groups, "group", "groups")}`,
  /** Classification labels; a value this build does not know is shown as stored. */
  classifications: {
    main_figure: "Main figure",
    supplementary_figure: "Supplementary figure",
    intermediate_output: "Intermediate output",
    quality_control: "Quality control",
    general: "General result",
  } as Readonly<Record<string, string>>,
  details: {
    type: "Type",
    storage: "Stored",
    copy: "Copied into the project",
    link: "Linked in place",
    classification: "Classification",
    none: "None",
    size: "Size",
    added: "Date added",
    source: "Original file",
    folders: "Groups",
    ungrouped: "Ungrouped",
  },
  expandAll: "Expand all",
  collapseAll: "Collapse all",
  totals: (results: number, groups: number) =>
    `${plural(results, "result", "results")} · ${plural(groups, "group", "groups")}`,
  menu: {
    preview: "Preview",
    details: "Show details",
    renameResult: "Rename display name",
    moveTo: "Move to group…",
    addTo: "Add to group…",
    moveUp: "Move up",
    moveDown: "Move down",
    remove: "Remove from this group",
    markMainFigure: "Mark as main figure",
    unmarkMainFigure: "Unmark main figure",
    clearClassification: "Clear classification",
    classify: "Classify as…",
    rename: "Rename",
    newSubgroup: "New subgroup",
    expandAll: "Expand all inside",
    collapseAll: "Collapse all inside",
    moveToTop: "Move to top level",
    moveInto: "Move into group…",
    delete: "Delete group",
  } satisfies Record<MenuLabel, string>,
  pick: {
    moveTo: "Move to which group?",
    addTo: "Add to which group?",
    moveInto: "Move into which group?",
    classify: "Classify as what?",
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

/** A classification as shown to the person: its label, or the stored slug when unknown. */
export function classificationLabel(value: string): string {
  return resultsMessages.classifications[value] ?? value;
}
