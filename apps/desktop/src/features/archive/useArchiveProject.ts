import { useCallback, useEffect, useRef, useState } from "react";
import type { commands, FolderHandle } from "../../ipc/bindings";
import {
  archiveProject,
  unarchiveProject,
  type ArchiveApi,
  type ArchiveFailure,
  type UnarchiveFailure,
} from "./model/archiveProject";

/** The commands the panel goes through. */
export type UnarchiveApi = ArchiveApi & Pick<typeof commands, "appVersion">;

type Failure = ArchiveFailure | UnarchiveFailure;

/** What the archive panel shows and does. */
export type ArchiveModel = {
  /** When the project was archived, or `null` if it is active. */
  archived: string | null;
  writable: boolean;
  /** The confirmation for unarchiving is showing. */
  confirming: boolean;
  running: boolean;
  /** Why the last attempt did nothing, or `null`. */
  failure: Failure | null;
  archive: () => void;
  askToUnarchive: () => void;
  cancel: () => void;
  confirmUnarchive: () => void;
};

type Options = {
  api: UnarchiveApi;
  folder: FolderHandle;
  archived: string | null;
  writable: boolean;
  now: () => Date;
  /** `project.yaml` was written: read it again to decide the mode afresh. */
  onChanged: () => void;
};

/**
 * Archives the open project, or unarchives it once the person has confirmed
 * (FR-ARC-09, FR-ARC-10). Never runs by itself.
 */
export function useArchiveProject(options: Options): ArchiveModel {
  const [confirming, setConfirming] = useState(false);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const latest = useRef(options);
  useEffect(() => {
    latest.current = options;
  });

  const finish = useCallback((error: Failure | null) => {
    setFailure(error);
    setRunning(false);
    if (error === null) latest.current.onChanged();
  }, []);

  const archive = useCallback(() => {
    const { api, folder, now } = latest.current;
    setRunning(true);
    setFailure(null);
    archiveProject({ api, folder, now })
      .then((done) => finish(done.ok ? null : done.error))
      .catch(() => finish("writeFailed"));
  }, [finish]);

  const confirmUnarchive = useCallback(() => {
    const { api, folder } = latest.current;
    setConfirming(false);
    setRunning(true);
    setFailure(null);
    api
      .appVersion()
      .then((appVersion) =>
        unarchiveProject({ api, folder, appVersion, confirmed: true }),
      )
      .then((done) => finish(done.ok ? null : done.error))
      .catch(() => finish("writeFailed"));
  }, [finish]);

  return {
    archived: options.archived,
    writable: options.writable,
    confirming,
    running,
    failure,
    archive,
    askToUnarchive: () => {
      setFailure(null);
      setConfirming(true);
    },
    cancel: () => setConfirming(false),
    confirmUnarchive,
  };
}
