import { assertNever } from "../../../shared/assertNever";
import { lockMode, releaseFlow, type LockApi } from "./lockFlows";
import {
  modeForSummary,
  modeForUnreadableProject,
  type OpenMode,
  type ReadOnlyReason,
} from "./mode";
import type { OpenedProject } from "./flows";
import { summariseProject } from "./summary";

/** What the reloaded `project.yaml` was found to hold: its text, or `null` if it is gone. */
type Reloaded = { text: string } | null;

/**
 * Whether the contents of `project.yaml` are what makes a project read-only
 * for `reason`. Such a project may become writable when the file is put
 * right; one held read-only by a lock or the medium may not.
 */
function causedByFile(reason: ReadOnlyReason): boolean {
  switch (reason.kind) {
    case "newerFormat":
    case "invalidProject":
    case "archived":
      return true;
    case "liveLock":
    case "staleLock":
    case "unreadableLock":
    case "blockedLock":
    case "readOnlyMedia":
    case "lockLost":
    case "lockUnavailable":
      return false;
    default:
      return assertNever(reason);
  }
}

/**
 * `project.yaml` was changed outside the application (FR-HIS-05). It has no
 * editor, so there is no local text to conflict with: what is on disk now
 * replaces what is shown, and the mode is decided again in the order of
 * spec 6.4 step 2, the file's own reasons before the lock.
 *
 * A project that becomes read-only because of the file lets go of its lock.
 * One that was read-only only because of the file asks for the lock again.
 * The lock is never asked for when the file itself says read-only, and a
 * project held read-only by a lock keeps that reason. Nothing is written.
 */
export async function reloadProjectFlow(
  api: LockApi,
  project: OpenedProject,
  file: Reloaded,
): Promise<OpenedProject> {
  const parsed = file === null ? null : summariseProject(file.text);
  if (parsed === null || !parsed.ok) {
    const failure = parsed === null ? "invalidProject" : parsed.error;
    await releaseFlow(api, project);
    return {
      ...project,
      summary: null,
      mode: modeForUnreadableProject(failure),
    };
  }
  const summary = parsed.value;
  const fromFile = modeForSummary(summary);
  if (fromFile !== null) {
    await releaseFlow(api, project);
    return { ...project, summary, mode: fromFile };
  }
  const mode = await modeWithoutFileReason(api, project);
  return { ...project, summary, mode };
}

/** The mode for a file that no longer says read-only: the lock, if that was the only obstacle. */
async function modeWithoutFileReason(
  api: LockApi,
  project: OpenedProject,
): Promise<OpenMode> {
  const { mode } = project;
  if (mode.kind === "readOnly" && causedByFile(mode.reason)) {
    return lockMode(api, project.folder, false);
  }
  return mode;
}
