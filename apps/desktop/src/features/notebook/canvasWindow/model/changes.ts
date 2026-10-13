/** Project files that changed, as the main window relays them from the watcher. */
export type FilesChanged = {
  /** Project-relative paths. */
  paths: readonly string[];
  /** Events may have been lost, so everything should be read again. */
  needsRescan: boolean;
};

// The canvas feature owns where canvas files live (ADR-0065); only the folder
// is needed here, to tell them from the rest of the notebook.
const CANVAS_DIR = "_notebook/canvases/";

const isCanvasFile = (path: string) => path.startsWith(CANVAS_DIR);

/**
 * Whether the canvas window must read the notebook again: something its
 * cards and tabs are drawn from (a question, an experiment, its evidence)
 * changed. Canvas files are left out because this window is their only
 * writer while it is open, so a change to one is its own save.
 */
export function reloadsNotebook(change: FilesChanged): boolean {
  return change.needsRescan || change.paths.some((path) => !isCanvasFile(path));
}

// Where the project's cached sources live (format-v1.md section 1).
const BIBLIOGRAPHY_PATH = "_notebook/bibliography.json";

/** Whether the cached sources changed, so the labels citations are shown by should be read again. */
export function touchesBibliography(change: FilesChanged): boolean {
  return change.needsRescan || change.paths.includes(BIBLIOGRAPHY_PATH);
}

/** Whether a canvas file changed, so a window that is not editing them should read them again. */
export function touchesCanvases(change: FilesChanged): boolean {
  return change.needsRescan || change.paths.some(isCanvasFile);
}
