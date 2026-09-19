import { describe, expect, it } from "vitest";
import type { LockHolder, LockOutcome } from "../../../ipc/bindings";
import {
  lockAction,
  modeAfterPoll,
  modeForLock,
  modeForSummary,
  modeForUnreadableProject,
  type OpenMode,
  type ReadOnlyReason,
} from "./mode";

const holder: LockHolder = {
  host: "lab-pc",
  pid: 4242,
  appVersion: "0.1.0",
  opened: "2026-09-19T10:00:00Z",
  heartbeat: "2026-09-19T10:04:00Z",
};

const writable: OpenMode = { kind: "writable" };
const readOnly = (reason: ReadOnlyReason): OpenMode => ({
  kind: "readOnly",
  reason,
});

describe("modeForLock", () => {
  const cases: [string, LockOutcome, OpenMode][] = [
    ["acquired", { kind: "acquired" }, writable],
    ["live", { kind: "live", holder }, readOnly({ kind: "liveLock", holder })],
    [
      "stale",
      { kind: "stale", holder },
      readOnly({ kind: "staleLock", holder }),
    ],
    [
      "unreadable and replaceable",
      { kind: "unreadable", replaceable: true },
      readOnly({ kind: "unreadableLock" }),
    ],
    [
      "unreadable and not replaceable",
      { kind: "unreadable", replaceable: false },
      readOnly({ kind: "blockedLock" }),
    ],
    [
      "read-only media",
      { kind: "readOnlyMedia" },
      readOnly({ kind: "readOnlyMedia" }),
    ],
  ];

  it.each(cases)("%s", (_name, outcome, expected) => {
    expect(modeForLock(outcome)).toEqual(expected);
  });
});

describe("modeForSummary", () => {
  it("opens an archived project read-only, before any lock is asked for", () => {
    expect(modeForSummary({ archived: "2026-09-01T09:00:00Z" })).toEqual(
      readOnly({ kind: "archived", archived: "2026-09-01T09:00:00Z" }),
    );
  });

  it("leaves a project that is not archived to the lock", () => {
    expect(modeForSummary({ archived: null })).toBeNull();
  });
});

describe("modeForUnreadableProject", () => {
  it("names a newer format and an invalid file as their own reasons", () => {
    expect(modeForUnreadableProject("newerFormat")).toEqual(
      readOnly({ kind: "newerFormat" }),
    );
    expect(modeForUnreadableProject("invalidProject")).toEqual(
      readOnly({ kind: "invalidProject" }),
    );
  });
});

describe("lockAction", () => {
  const reasons: [ReadOnlyReason, "retry" | "takeOver" | null][] = [
    [{ kind: "staleLock", holder }, "takeOver"],
    [{ kind: "unreadableLock" }, "takeOver"],
    [{ kind: "liveLock", holder }, "retry"],
    [{ kind: "readOnlyMedia" }, "retry"],
    [{ kind: "lockLost" }, "retry"],
    [{ kind: "lockUnavailable" }, "retry"],
    [{ kind: "blockedLock" }, null],
    [{ kind: "newerFormat" }, null],
    [{ kind: "invalidProject" }, null],
    [{ kind: "archived", archived: "2026-09-01T09:00:00Z" }, null],
  ];

  it.each(reasons)("%j", (reason, action) => {
    expect(lockAction(reason)).toBe(action);
  });

  it("offers a takeover only for a lock that is stale or unreadable, never a live one", () => {
    const offered = reasons
      .filter(([, action]) => action === "takeOver")
      .map(([reason]) => reason.kind);
    expect(offered).toEqual(["staleLock", "unreadableLock"]);
  });
});

describe("modeAfterPoll", () => {
  it("keeps a project writable while the lock is held", () => {
    expect(modeAfterPoll(writable, "held")).toEqual(writable);
  });

  it("turns a writable project read-only when the lock is lost or gone", () => {
    for (const state of ["lost", "notHeld"] as const) {
      expect(modeAfterPoll(writable, state)).toEqual(
        readOnly({ kind: "lockLost" }),
      );
    }
  });

  it("never changes a project that is already read-only", () => {
    const already = readOnly({ kind: "newerFormat" });
    for (const state of ["held", "lost", "notHeld"] as const) {
      expect(modeAfterPoll(already, state)).toBe(already);
    }
  });
});
