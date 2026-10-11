import type { CanvasFailure } from "./model/store";

/** User-facing text of the canvas view, in British English (AGENTS.md section 5). */
export const canvasMessages = {
  viewLabel: "View",
  table: "Table",
  canvas: "Canvas",

  pickerLabel: "Canvas",
  newCanvas: "New canvas",
  rename: "Rename",
  remove: "Delete",
  nameLabel: "Canvas name",
  newSubmit: "Create canvas",
  renameSubmit: "Save name",
  cancel: "Cancel",
  /** Shown for a canvas file that could not be read, in place of its name. */
  unreadableOption: (fileName: string) => `${fileName} (cannot be read)`,
  unreadableNotice:
    "This canvas file could not be read, so it is shown as it is and has not been changed. It can still be deleted.",
  deleteHeading: (name: string) => `Delete “${name}”?`,
  deleteBody:
    "Only this canvas is removed, by moving its file to the project’s trash folder. Results, experiments and their text are not touched.",
  deleteConfirm: "Move to trash",

  loading: "Loading canvases…",
  noCanvases: "This project has no canvases yet.",
  noCanvasesHint:
    "A canvas lets you arrange results from any experiment side by side while you write.",
  emptyCanvas: "This canvas is empty.",
  readOnlyProject:
    "This project is read-only, so canvases can be viewed but not created or changed.",

  resultsHeading: "Results",
  resultsPlaceholder:
    "The results of every experiment in the project will be listed here.",
  writingHeading: "Writing",
  writingPlaceholder:
    "The Methods, Results Notes and Interpretation of an experiment will be edited here.",
  hideResults: "Hide results",
  showResults: "Show results",
  hideWriting: "Hide writing",
  showWriting: "Show writing",
  resizeResults: "Resize the results panel",
  resizeWriting: "Resize the writing panel",

  surfaceLabel: "Canvas",
  zoom: (percent: number) => `Zoom: ${percent}%`,
  fitView: "Fit to view",
  resetView: "Reset view",
  credit: "Pan and zoom by React Flow (MIT licence)",

  cardLabel: (name: string, experiment: string) =>
    `${name}, from ${experiment}`,
  openOriginal: (name: string) => `Open ${name}`,
  removeCard: "Remove from canvas",
  newerVersion: (version: number) => `v${version} is available`,
  updateTo: (version: number) => `Update to v${version}`,
  missingCard: "Result not available",
  missingReasons: {
    experiment: "Its experiment is no longer in the project.",
    artefact: "The result is no longer in its experiment.",
    version: "The version shown here is no longer one of its versions.",
  },
  missingKept:
    "The card is kept so you can see what was here. Removing it does not affect any result.",
  pinHint: "Drag a result here, or choose Pin to canvas from its menu.",
  pinFailed: "Nothing was pinned. Choose a canvas first.",

  failures: {
    unreadable: "The canvases could not be read. Nothing was changed.",
    invalidName:
      "Enter a name on a single line, without line breaks or other control characters.",
    invalid: "That canvas file could not be read, so it was not changed.",
    changed:
      "That canvas file was changed outside the application, so nothing was saved. Reloaded.",
    exists:
      "A canvas with that identifier already exists, so nothing was written. Try again.",
    notWritable:
      "This project is read-only in this window, so nothing was saved.",
    writeFailed: "The canvas could not be saved. Nothing was lost.",
  } satisfies Record<CanvasFailure, string>,
} as const;
