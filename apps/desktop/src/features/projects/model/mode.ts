import type { LockHolder, LockOutcome, LockState } from "../../../ipc/bindings";
import { assertNever } from "../../../shared/assertNever";
import type { OpenFailure, ProjectSummary } from "./summary";

/**
 * Why a project is open read-only (spec 6.4 step 2, FR-PRJ-06). The reasons
 * are checked in the order the specification lists them, and the first one
 * that applies is the one shown: a project that is read-only for a reason
 * before the lock never asks for one.
 *
 * The development-build reason arrives with S7-T03.
 */
export type ReadOnlyReason =
  | { kind: "newerFormat" }
  | { kind: "invalidProject" }
  | { kind: "archived"; archived: string }
  | { kind: "liveLock"; holder: LockHolder }
  | { kind: "staleLock"; holder: LockHolder }
  | { kind: "unreadableLock" }
  /** `.lock` is a folder, a link or a read-only file the application will not replace. */
  | { kind: "blockedLock" }
  | { kind: "readOnlyMedia" }
  /** The lock was taken over, or its heartbeat failed, while the project was open. */
  | { kind: "lockLost" }
  /** The lock could not be asked for. When unsure, read-only (P6). */
  | { kind: "lockUnavailable" };

export type OpenMode =
  { kind: "writable" } | { kind: "readOnly"; reason: ReadOnlyReason };

/** What the person can do about a read-only project, if anything. */
export type LockAction = "retry" | "takeOver";

const readOnly = (reason: ReadOnlyReason): OpenMode => ({
  kind: "readOnly",
  reason,
});

/** A project.yaml that could not be used is opened read-only, unchanged. */
export function modeForUnreadableProject(failure: OpenFailure): OpenMode {
  return readOnly({ kind: failure });
}

/**
 * The mode decided by what `project.yaml` says, before any lock: `null` when
 * nothing in it makes the project read-only.
 */
export function modeForSummary(
  summary: Pick<ProjectSummary, "archived">,
): OpenMode | null {
  return summary.archived === null
    ? null
    : readOnly({ kind: "archived", archived: summary.archived });
}

/** The mode the answer to a lock request leads to. */
export function modeForLock(outcome: LockOutcome): OpenMode {
  switch (outcome.kind) {
    case "acquired":
      return { kind: "writable" };
    case "live":
      return readOnly({ kind: "liveLock", holder: outcome.holder });
    case "stale":
      return readOnly({ kind: "staleLock", holder: outcome.holder });
    case "unreadable":
      return readOnly({
        kind: outcome.replaceable ? "unreadableLock" : "blockedLock",
      });
    case "readOnlyMedia":
      return readOnly({ kind: "readOnlyMedia" });
    default:
      return assertNever(outcome);
  }
}

/** The mode when the lock could not be asked for at all. */
export function modeForLockFailure(): OpenMode {
  return readOnly({ kind: "lockUnavailable" });
}

/**
 * The button a banner offers. A takeover is offered only for a lock that is
 * stale or unreadable, never for a live one: the confirmation it sends is the
 * person's answer to exactly that question.
 */
export function lockAction(reason: ReadOnlyReason): LockAction | null {
  switch (reason.kind) {
    case "staleLock":
    case "unreadableLock":
      return "takeOver";
    case "liveLock":
    case "readOnlyMedia":
    case "lockLost":
    case "lockUnavailable":
      return "retry";
    case "blockedLock":
    case "newerFormat":
    case "invalidProject":
    case "archived":
      return null;
    default:
      return assertNever(reason);
  }
}

/**
 * The mode after asking whether the lock is still held. A project that was
 * writable and no longer holds its lock is read-only; nothing else changes.
 */
export function modeAfterPoll(mode: OpenMode, state: LockState): OpenMode {
  if (mode.kind !== "writable" || state === "held") return mode;
  return readOnly({ kind: "lockLost" });
}

/** Whether the registry may still hold a lock for a project in this mode. */
export function holdsLock(mode: OpenMode): boolean {
  return (
    mode.kind === "writable" ||
    (mode.kind === "readOnly" && mode.reason.kind === "lockLost")
  );
}
