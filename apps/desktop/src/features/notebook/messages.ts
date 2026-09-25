import type {
  ArtefactModel,
  ColumnKey,
  ExperimentStatus,
  NotebookError,
  Problem,
} from "@research-notebook/format";
import { assertNever } from "../../shared/assertNever";
import type { AutosaveStatus } from "./expanded/model/autosave";
import type { LoadFailure } from "./model/load";
import type { Performed } from "./model/perform";
import type { SearchHit } from "./search/model/searchIndex";

/** User-facing text for the notebook feature, in British English (AGENTS.md section 5). */
export const messages = {
  heading: "Questions and experiments",
  loading: "Loading questions and experiments…",
  refresh: "Refresh",
  working: "Working…",
  readOnly: "This project is read-only, so nothing here can be changed.",
  empty: "There are no questions yet. Add one to start.",
  newQuestionLabel: "New question",
  newQuestionPlaceholder: "For example, Do batch effects explain the signal?",
  addQuestion: "Add question",
  addExperiment: "Add experiment",
  noExperiments: "No experiments in this question yet.",
  unassignedHeading: "Unassigned",
  unassignedNote:
    "These experiments belong to a question that no longer exists. Move them to a question to keep them together.",
  problemsHeading: "Things to check",
  edit: "Edit",
  save: "Save",
  cancel: "Cancel",
  move: "Move",
  moveLabel: "Move to question",
  delete: "Delete",
  confirmDelete: "Move to trash",
  titleLabel: "Title",
  statusLabel: "Status",
  startedLabel: "Started",
  completedLabel: "Completed",
  notInOrder: "Not in the saved order",
  duplicateRefBadge: "Shares its ref",
  readOnlyItem: "Read-only: another file has the same ID",
  unexpected: "Something unexpected happened. The list has been refreshed.",
} as const;

/** Text of the workspace table (FR-TBL-01 to FR-TBL-05, FR-TBL-10). */
export const tableMessages = {
  tableLabel: "Experiments by question",
  experimentColumn: "Experiment",
  emptyCell: "Empty",
  resultsNone: "None yet",
  noMotivation: "No motivation yet",
  noMatches: "No experiments in this question match the filter.",
  filterLabel: "Filter experiments",
  filterPlaceholder: "Ref, title or text",
  statusFilterLabel: "Status",
  allStatuses: "All statuses",
  sortLabel: "Sort within each question",
  sortNone: "Project order",
  sortRef: "Ref",
  sortTitle: "Title",
  sortStatus: "Status",
  sortStarted: "Started",
  sortCompleted: "Completed",
  ascending: "Ascending",
  descending: "Descending",
  changeDirection: "Change sort direction",
  columnsButton: "Columns",
  columnsHeading: "Columns",
  resetColumns: "Reset columns",
  sessionOnly:
    "This project is read-only, so column changes are kept only until it is closed.",
  detailsHeading: "Selected",
  detailsHint:
    "Select an experiment or a question in the table to edit, move or delete it.",
} as const;

/** Text of the expanded experiment view (FR-EDT-03, FR-TBL-07). */
export const expandedMessages = {
  heading: "Sections",
  passthroughLabel: "Not editable here — kept as written",
  /** The dialog a reference chip opens (FR-EDT-06). */
  referencePreviewHeading: "Reference preview",
  closePreview: "Close",
  /** Shown next to a reference whose artefact has a newer version (FR-EDT-07). */
  newerVersionBadge: "Newer version available",
  /** Shown on a reference whose artefact no longer exists (FR-EDT-08). */
  detachedBadge: "Artefact removed",
  /** The one-reference update control, next to the badge. */
  updateReference: "Update",
  /** The section-wide update control, offered under the live editor. */
  updateAllInSection: "Update all in section",
} as const;

/** aria-label for a chip's "Update" button (FR-EDT-07). */
export function updateReferenceLabel(label: string, version: number): string {
  return `Update ${label} to ${artefactVersionLabel(version)}`;
}

/** Label for the button that makes a static section the live editor (FR-EDT-03: only one editor is live at a time). */
export function editLabel(label: string): string {
  return `Edit ${label}`;
}

/** Text of project search (FR-SRC-01, FR-SRC-02). */
export const searchMessages = {
  toggle: "Search",
  heading: "Search",
  queryLabel: "Search this project",
  queryPlaceholder: "Title, section text, artefact name or filename",
  empty: "No matches.",
  titleField: "Title",
  motivationField: "Motivation",
  artefactNameField: "Artefact name",
  artefactFilenameField: "Filename",
} as const;

/** Which field a search hit came from, as a short label next to its snippet. */
export function searchHitFieldLabel(hit: SearchHit): string {
  switch (hit.kind) {
    case "title":
      return searchMessages.titleField;
    case "motivation":
      return searchMessages.motivationField;
    case "section":
      return columnLabel(hit.section);
    case "artefactName":
      return searchMessages.artefactNameField;
    case "artefactFilename":
      return searchMessages.artefactFilenameField;
    default:
      return assertNever(hit);
  }
}

/** The matched text or snippet a search hit shows. */
export function searchHitText(hit: SearchHit): string {
  switch (hit.kind) {
    case "title":
    case "artefactName":
    case "artefactFilename":
      return hit.text;
    case "motivation":
    case "section":
      return hit.snippet;
    default:
      return assertNever(hit);
  }
}

/** Text of the @ autocomplete (FR-EDT-04). */
export const artefactAutocompleteMessages = {
  label: "Artefacts",
  empty: "No matching artefacts",
  ungrouped: "Ungrouped",
} as const;

const artefactTypeLabels: Record<ArtefactModel["type"], string> = {
  image: "Image",
  pdf: "PDF",
  svg: "SVG",
  table: "Table",
  script: "Script",
  notebook: "Notebook",
  text: "Text",
  html: "HTML",
  other: "Other",
};

export function artefactTypeLabel(type: ArtefactModel["type"]): string {
  return artefactTypeLabels[type];
}

/** "v2" for a captured artefact's version. */
export function artefactVersionLabel(version: number): string {
  return `v${version}`;
}

const autosaveStatusLabels: Record<AutosaveStatus, string> = {
  saved: "Saved",
  saving: "Saving…",
  unsaved: "Unsaved",
  error: "Error",
};

/** Saved, Saving, Unsaved or Error (FR-EDT-03), with the reason for an error appended. */
export function autosaveStatusText(
  status: AutosaveStatus,
  message: string | null,
): string {
  const label = autosaveStatusLabels[status];
  return status === "error" && message !== null
    ? `${label}: ${message}`
    : label;
}

const columnLabels: Record<ColumnKey, string> = {
  motivation: "Motivation",
  methods: "Methods",
  results: "Results",
  results_notes: "Results notes",
  interpretation: "Interpretation",
  literature: "Literature",
};

export function columnLabel(key: ColumnKey): string {
  return columnLabels[key];
}

export const showColumnLabel = (label: string) => `Show ${label}`;
export const widthLabel = (label: string) => `Width of ${label} (pixels)`;
export const resizeLabel = (label: string) => `Resize ${label} column`;
export const collapseLabel = (ref: string) => `Collapse ${ref}`;
export const expandLabel = (ref: string) => `Expand ${ref}`;
export const selectLabel = (ref: string) => `Select ${ref}`;

/** "2 experiments", or "1 of 2 experiments" while a filter is in force (FR-TBL-03). */
export function countLabel(
  shown: number,
  total: number,
  filtered: boolean,
): string {
  const noun = total === 1 ? "experiment" : "experiments";
  return filtered ? `${shown} of ${total} ${noun}` : `${total} ${noun}`;
}

/** Warning shown before an experiment is moved to the trash. */
export function deleteExperimentWarning(ref: string): string {
  return `${ref} and its folder will be moved to the trash.`;
}

/** Warning shown before a question is moved to the trash; its experiments stay. */
export function deleteQuestionWarning(
  ref: string,
  experiments: number,
): string {
  if (experiments === 0) return `${ref} will be moved to the trash.`;
  const noun = experiments === 1 ? "experiment" : "experiments";
  return `${ref} will be moved to the trash. Its ${experiments} ${noun} will be kept and shown as unassigned.`;
}

/** Label of the field that adds an experiment to the question `ref`. */
export function newExperimentLabel(ref: string): string {
  return `New experiment in ${ref}`;
}

const statusLabels: Record<ExperimentStatus, string> = {
  planned: "Planned",
  running: "Running",
  complete: "Complete",
  abandoned: "Abandoned",
};

export const statusOptions = Object.keys(statusLabels) as ExperimentStatus[];

export function statusLabel(status: ExperimentStatus): string {
  return statusLabels[status];
}

/** Why the questions and experiments could not be shown. */
export function loadFailureMessage(reason: LoadFailure): string {
  switch (reason) {
    case "projectFile":
      return "The project file could not be read, so questions and experiments are not shown. Nothing was changed.";
    case "unavailable":
      return "The list of questions and experiments could not be read. Nothing was changed.";
    default:
      return assertNever(reason);
  }
}

const dateRefusal = "Enter a real date as YYYY-MM-DD, or leave it empty.";

/** What to say about a refused value, by the name of the field it was typed into. */
const fieldRefusals: Record<string, string> = {
  title: "Enter a title on one line.",
  status: "Choose one of the listed statuses.",
  started: dateRefusal,
  completed: dateRefusal,
  text: 'This text cannot be saved as written. Check for a heading starting with "##", an unclosed code block, or a literature marker, then try again.',
};

/** Why the format refused a value the person typed. */
export function refusalMessage(error: NotebookError): string {
  switch (error.kind) {
    case "invalid":
      return (
        (error.field === undefined ? undefined : fieldRefusals[error.field]) ??
        "That value is not allowed. Nothing was changed."
      );
    case "notFound":
      return `That ${error.entity} no longer exists. The list has been refreshed.`;
    default:
      return assertNever(error);
  }
}

/**
 * What to tell the person about an operation that did not finish, or `null`
 * when it did. `"unexpected"` is not a `perform()` outcome; it is what
 * `useNotebook` reports for a genuinely unexpected exception.
 */
export function outcomeMessage(
  done: Performed | { kind: "unexpected" },
): string | null {
  switch (done.kind) {
    case "unexpected":
      return messages.unexpected;
    case "done":
      return null;
    case "refused":
      return refusalMessage(done.error);
    case "notWritten":
      return done.reason === "notWritable"
        ? "This project is read-only in this window, so nothing was changed."
        : "The backup that must come before the first change by this version could not be made, so nothing was changed.";
    case "interrupted":
      if (done.reason === "changed") {
        return done.written === 0
          ? "A file was changed outside the application, so nothing was changed. The list has been refreshed."
          : "A file was changed outside the application part way through. The list has been refreshed; check the result.";
      }
      return done.written === 0
        ? "The change could not be saved, so nothing was changed. The list has been refreshed."
        : "The change could not be finished. Some files were saved; the list has been refreshed, so check the result.";
    default:
      return assertNever(done);
  }
}

/** What is wrong, in a sentence that names the refs involved. Never a path or system text. */
export function problemMessage(problem: Problem): string {
  switch (problem.kind) {
    case "duplicateRef":
      return `Two ${problem.entity}s share the ref ${problem.ref}. Their IDs stay authoritative, so nothing is hidden; renumbering is not available yet.`;
    case "duplicateId":
      return `Two ${problem.entity} files have the same ID (${problem.locations.join(" and ")}). The later one is read-only.`;
    case "folderRefMismatch":
      return `The folder ${problem.folder} holds ${problem.ref}. The ID is authoritative, so it is shown as ${problem.ref}.`;
    case "orderNamesNoFile":
      return `The saved order names a ${problem.entity} that has no file. It is ignored and dropped the next time the order is saved.`;
    case "orderMisplaced":
      return "The saved order lists an experiment under a different question from the one its file names. Its file decides where it is shown.";
    case "unreadable":
      return `A file could not be read and was left untouched: ${problem.path.replace(/^_notebook\//, "")}.`;
    default:
      return assertNever(problem);
  }
}
