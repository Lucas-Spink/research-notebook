import type { commands } from "../../../ipc/bindings";
import { assertNever } from "../../../shared/assertNever";
import { lockMode, releaseFlow, type LockApi } from "./lockFlows";
import {
  modeForSummary,
  modeForUnreadableProject,
  type OpenMode,
  type ReadOnlyReason,
} from "./mode";
import type { OpenedProject } from "./flows";
import { summariseProject, type ProjectSummary } from "./summary";

/** The project-relative path of `project.yaml`, which the watcher reports. */
export const PROJECT_YAML = "_notebook/project.yaml";

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

/** What reading `project.yaml` at the start of watching found. */
export type Seed = {
  /** The hash to track the file from; `null` if there is no file. */
  base: string | null;
  /** The file no longer says what the project shown was made from. */
  stale: boolean;
  /** What was read (`null`: the file is gone), to reload from if `stale`. */
  file: { text: string; sha256: string } | null;
};

/** What a `project.yaml` amounts to: its summary, or the reason it cannot be used. */
function describe(
  summary: ProjectSummary | null,
  failure: string | null,
): string {
  return JSON.stringify(summary ?? failure);
}

/**
 * What the project shown was made from, in the same terms, or `null` if that
 * cannot be told (which is treated as stale, so it is looked at again).
 */
function shownAs(project: OpenedProject): string | null {
  if (project.summary !== null) return describe(project.summary, null);
  const mode = project.mode;
  if (mode.kind !== "readOnly") return null;
  const reason = mode.reason.kind;
  return reason === "newerFormat" || reason === "invalidProject"
    ? describe(null, reason)
    : null;
}

/**
 * Reads `project.yaml` as watching begins, to track it from what is on disk
 * now. The project was opened a moment earlier, so the file may already have
 * changed: `stale` says whether it did. `null` if the file could not be read,
 * in which case nothing is tracked.
 */
export async function seedProjectFile(
  api: Pick<typeof commands, "readNotebookFile">,
  project: OpenedProject,
): Promise<Seed | null> {
  const read = await api.readNotebookFile(project.folder, PROJECT_YAML);
  if (read.status === "error") return null;
  if (read.data.kind === "missing") {
    return { base: null, stale: true, file: null };
  }
  const file = { text: read.data.text, sha256: read.data.sha256 };
  const parsed = summariseProject(file.text);
  const now = parsed.ok
    ? describe(parsed.value, null)
    : describe(null, parsed.error);
  return { base: file.sha256, stale: now !== shownAs(project), file };
}
