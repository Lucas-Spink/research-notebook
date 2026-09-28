import type {
  ArtefactsFileModel,
  NotebookEnv,
  NotebookError,
  NotebookState,
  Result,
} from "@research-notebook/format";
import type { commands } from "../../../ipc/bindings";
import type { Reload, Tracked } from "../../conflicts";

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

/**
 * How a change to an experiment's evidence went: saved, refused by the
 * format (`error`, for the caller to show where the change was asked for),
 * or not saved for another reason (`null`: the notice already says why).
 */
export type ArtefactsOutcome =
  { ok: true } | { ok: false; error: NotebookError | null };

/**
 * Changes one experiment's artefacts.yaml (ADR-0044): `change` is given the
 * file as loaded and returns the next one. Resolves whether it was saved; a
 * refusal or failure is shown as a notice, like any other action. Shared by
 * `useNotebook`'s own action, adding files and importing the inbox on open,
 * so none of them needs to import `useNotebook` itself.
 */
export type EditArtefacts = (
  experimentFolder: string,
  change: (
    file: ArtefactsFileModel,
    env: NotebookEnv,
  ) => Result<ArtefactsFileModel, NotebookError>,
) => Promise<ArtefactsOutcome>;
