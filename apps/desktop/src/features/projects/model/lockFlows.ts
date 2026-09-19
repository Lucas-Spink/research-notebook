import type { commands, FolderHandle } from "../../../ipc/bindings";
import {
  holdsLock,
  lockAction,
  modeAfterPoll,
  modeForLock,
  modeForLockFailure,
  type OpenMode,
} from "./mode";

/** The commands the lock flows call, so tests can supply a fake with the same shape. */
export type LockApi = Pick<
  typeof commands,
  "acquireProjectLock" | "projectLockState" | "releaseProjectLock"
>;

/** What the lock flows need to know about an open project. */
type Lockable = { folder: FolderHandle; mode: OpenMode };

/** Asks for the project's lock and turns the answer into a mode. A lock that cannot be asked for leaves the project read-only, never writable. */
export async function lockMode(
  api: LockApi,
  folder: FolderHandle,
  confirmTakeover: boolean,
): Promise<OpenMode> {
  const answer = await api.acquireProjectLock(folder, confirmTakeover);
  return answer.status === "ok"
    ? modeForLock(answer.data)
    : modeForLockFailure();
}

/**
 * The person agreed to take over a stale or unreadable lock (FR-PRJ-05).
 * The confirmation is sent only for a project whose banner offered it; any
 * other project is returned as it was, so a takeover can never be sent for a
 * live lock or a project that is read-only for another reason.
 */
export async function takeOverFlow<P extends Lockable>(
  api: LockApi,
  project: P,
): Promise<P> {
  if (
    project.mode.kind !== "readOnly" ||
    lockAction(project.mode.reason) !== "takeOver"
  ) {
    return project;
  }
  return { ...project, mode: await lockMode(api, project.folder, true) };
}

/** Asks for the lock again, for a read-only reason that may have passed. */
export async function retryLockFlow<P extends Lockable>(
  api: LockApi,
  project: P,
): Promise<P> {
  if (
    project.mode.kind !== "readOnly" ||
    lockAction(project.mode.reason) !== "retry"
  ) {
    return project;
  }
  return { ...project, mode: await lockMode(api, project.folder, false) };
}

/**
 * Asks whether a writable project still holds its lock, so one taken over
 * while it is open turns read-only. A check that itself fails changes
 * nothing: a false alarm would be worse than waiting for the next check.
 */
export async function checkLockFlow<P extends Lockable>(
  api: LockApi,
  project: P,
): Promise<P> {
  if (project.mode.kind !== "writable") return project;
  const state = await api.projectLockState(project.folder);
  if (state.status === "error") return project;
  const mode = modeAfterPoll(project.mode, state.data);
  return mode === project.mode ? project : { ...project, mode };
}

/** Releases the lock when a project is replaced by another. */
export async function releaseFlow(
  api: LockApi,
  project: Lockable,
): Promise<void> {
  if (holdsLock(project.mode)) await api.releaseProjectLock(project.folder);
}
