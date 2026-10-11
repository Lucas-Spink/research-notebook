import type { CanvasFailure } from "./model/store";

/** User-facing text of the canvas view, in British English (AGENTS.md section 5). */
export const canvasMessages = {
  viewLabel: "View",
  table: "Table",
  canvas: "Canvas",

  questionsLabel: "Questions",
  noQuestions: "This project has no questions yet.",
  noQuestionsHint:
    "Add a question in the Table. Each question has its own canvas for drafting ideas.",
  unreadableNotice:
    "This question's canvas file could not be read, so it is shown as it is and has not been changed.",
  loading: "Loading the canvas…",
  readOnlyProject:
    "This project is read-only, so the canvas can be viewed but not changed.",

  resultsHeading: "Results",
  resultsPlaceholder:
    "The results of every experiment in the project will be listed here.",
  notesHeading: "Notes",
  hideResults: "Hide results",
  showResults: "Show results",
  hideNotes: "Hide notes",
  showNotes: "Show notes",
  resizeResults: "Resize the results panel",
  resizeNotes: "Resize the notes panel",
  addNote: "Add note",

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
  pinHint:
    "Drag a result here, or choose Pin to canvas from its menu. Add a note and join it to a figure with a line.",
  pinFailed: "Nothing was added. Choose a question first.",

  noteLabel: "Note",
  notePlaceholder: "Write a note… (type /cite to cite a source)",
  removeNote: "Delete note",
  noteHandle: "Draw a line from this card",

  summaryEmpty:
    "No notes on this canvas yet. Add a note, then join it to the figures it is about with a line.",
  emptyNote: "Empty note",
  refersTo: "Refers to",
  linkedNotes: "Linked to notes",
  selectNote: (excerpt: string) => `Show this note on the canvas: ${excerpt}`,
  figureLine: (name: string, experiment: string, version: number | null) =>
    version === null
      ? `${name} (${experiment})`
      : `${name} (${experiment}, v${version})`,
  missingFigure: "A result that is no longer available",

  failures: {
    unreadable: "The canvases could not be read. Nothing was changed.",
    invalid: "That canvas file could not be read, so it was not changed.",
    changed:
      "The canvas file was changed outside the application, so your latest change was not saved. It is shown as it is now.",
    notWritable:
      "This project is read-only in this window, so nothing was saved.",
    writeFailed: "The canvas could not be saved. Nothing was lost.",
  } satisfies Record<CanvasFailure, string>,
} as const;
