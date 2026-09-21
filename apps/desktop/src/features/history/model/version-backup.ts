import type {
  BackupMade,
  commands,
  FolderHandle,
  ProjectError,
} from "../../../ipc/bindings";

/** The one command the guard calls, so tests can supply a fake with its shape. */
export type Api = Pick<typeof commands, "backupForVersionChange">;

export type Guarded =
  { ok: true; value: BackupMade | null } | { ok: false; error: ProjectError };

export type FirstWriteGuard = {
  /**
   * Call before every write. Resolves `ok` when the write may go ahead: no
   * backup was due, or it has been made. A failure means do not write.
   */
  beforeWrite(): Promise<Guarded>;
};

/** Whether a backup is due before writing: the version that last wrote differs. */
export function needsVersionBackup(
  lastWrittenBy: string,
  appVersion: string,
): boolean {
  return lastWrittenBy !== appVersion;
}

/**
 * The guard for one open project. `lastWrittenBy` is the parsed
 * `last_written_by` of `project.yaml` and `appVersion` this build's version.
 * The backup is made once, before the first write; writes that start while it
 * is under way wait for that one, and a failed backup is tried again by the
 * next write, so no write ever goes ahead without it.
 */
export function createFirstWriteGuard(
  api: Api,
  folder: FolderHandle,
  lastWrittenBy: string,
  appVersion: string,
): FirstWriteGuard {
  let due = needsVersionBackup(lastWrittenBy, appVersion);
  let underWay: Promise<Guarded> | null = null;

  async function backUp(): Promise<Guarded> {
    const result = await api.backupForVersionChange(folder);
    if (result.status === "error") return { ok: false, error: result.error };
    due = false;
    return { ok: true, value: result.data };
  }

  return {
    beforeWrite() {
      if (!due) return Promise.resolve({ ok: true, value: null });
      underWay ??= backUp().finally(() => {
        underWay = null;
      });
      return underWay;
    },
  };
}
