import type { commands } from "../../../ipc/bindings";
import type { Reload, Tracked } from "../../conflicts";
import type { NotebookState } from "@research-notebook/format";

/** The commands that read the notebook, so tests can supply a fake with their shape. */
export type ReadApi = Pick<
  typeof commands,
  "listNotebookFiles" | "readNotebookFile"
>;

/** The commands that write it. */
export type WriteApi = Pick<
  typeof commands,
  "writeNotebookFile" | "moveToTrash" | "backupForVersionChange"
>;

/**
 * What the notebook needs from the file watcher held by `useExternalChanges`:
 * to say which files it holds, to mark its own saves so they are not taken for
 * outside changes, and to hear of real ones (ADR-0024, ADR-0026).
 */
export type ChangesPort = {
  /** Starts holding `path`, loaded from the disk version with hash `base` (`null`: no file). */
  track(path: string, base: string | null): void;
  /** Changes what is held for `path`. Ignored if it is not held. */
  update(path: string, change: (held: Tracked) => Tracked): void;
  /** Stops holding `path`. */
  untrack(path: string): void;
  /** Calls `handler` when a held file is replaced from disk. Returns how to stop. */
  onReload(handler: (reload: Reload) => void): () => void;
};

/** What was read from disk: the parsed notebook and the hash each file had. */
export type Loaded = {
  state: NotebookState;
  /** Project-relative path to SHA-256, for the files that are held: `project.yaml`, questions and `experiment.md`. */
  hashes: Readonly<Record<string, string>>;
};
