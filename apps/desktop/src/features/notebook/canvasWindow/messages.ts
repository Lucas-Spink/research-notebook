/** Text of the pop-out canvas window and the button that opens it. British English, as everything the person reads. */
export const canvasWindowMessages = {
  loading: "Loading the canvas…",
  unavailable:
    "This window shows a project's canvas from the main window. Close it and use Pop out canvas there.",
  failed:
    "The project could not be read, so its canvas cannot be shown. Nothing has been changed.",
  popOut: "Pop out canvas",
  popOutHint: "Open the canvas in its own window, beside the table",
  popOutOpen: "Canvas is in its own window",
  focusCanvas: "Show canvas window",
  popOutFailed:
    "The canvas window could not be opened. Your project has not been changed.",
} as const;
