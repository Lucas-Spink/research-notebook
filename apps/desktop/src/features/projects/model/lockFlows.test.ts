import { describe, expect, it } from "vitest";
import { failure, fakeApi, ok } from "./fakeApi";
import {
  checkLockFlow,
  releaseFlow,
  retryLockFlow,
  takeOverFlow,
  type OpenedProject,
} from "./flows";
import type { ReadOnlyReason } from "./mode";

const ID = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";

const holder = {
  host: "lab-pc",
  pid: 1,
  appVersion: "0.1.0",
  opened: "2026-09-19T10:00:00Z",
  heartbeat: "2026-09-19T10:01:00Z",
};

const openProjectWith = (mode: OpenedProject["mode"]): OpenedProject => ({
  folder: 7,
  path: "C:/work/project",
  summary: {
    id: ID,
    name: "Batch effects",
    evidenceInGit: false,
    externalRoots: [],
    archived: null,
  },
  mode,
});

const writable = { kind: "writable" } as const;
const readOnly = (reason: ReadOnlyReason): OpenedProject["mode"] => ({
  kind: "readOnly",
  reason,
});

describe("takeOverFlow", () => {
  it("confirms the takeover of a stale lock and opens the project writable", async () => {
    const { api, calls } = fakeApi();
    const result = await takeOverFlow(
      api,
      openProjectWith(readOnly({ kind: "staleLock", holder })),
    );
    expect(calls).toEqual([{ command: "acquireProjectLock", args: [7, true] }]);
    expect(result.mode).toEqual(writable);
  });

  it("confirms the takeover of an unreadable lock", async () => {
    const { api, calls } = fakeApi();
    await takeOverFlow(
      api,
      openProjectWith(readOnly({ kind: "unreadableLock" })),
    );
    expect(calls[0]?.args).toEqual([7, true]);
  });

  it("stays read-only when the takeover is refused", async () => {
    const { api } = fakeApi({
      acquireProjectLock: ok({ kind: "live", holder }),
    });
    const result = await takeOverFlow(
      api,
      openProjectWith(readOnly({ kind: "staleLock", holder })),
    );
    expect(result.mode).toEqual(readOnly({ kind: "liveLock", holder }));
  });

  it("never sends a confirmation for any other project or reason", async () => {
    for (const mode of [
      writable,
      readOnly({ kind: "liveLock", holder }),
      readOnly({ kind: "blockedLock" }),
      readOnly({ kind: "newerFormat" }),
      readOnly({ kind: "archived", archived: "2026-09-01T09:00:00Z" }),
    ]) {
      const { api, calls } = fakeApi();
      const before = openProjectWith(mode);
      expect(await takeOverFlow(api, before)).toBe(before);
      expect(calls).toEqual([]);
    }
  });
});

describe("retryLockFlow", () => {
  it("asks again without confirming anything", async () => {
    const { api, calls } = fakeApi();
    const result = await retryLockFlow(
      api,
      openProjectWith(readOnly({ kind: "liveLock", holder })),
    );
    expect(calls).toEqual([
      { command: "acquireProjectLock", args: [7, false] },
    ]);
    expect(result.mode).toEqual(writable);
  });

  it("does not ask for a project that cannot be retried", async () => {
    for (const mode of [
      writable,
      readOnly({ kind: "staleLock", holder }),
      readOnly({ kind: "invalidProject" }),
    ]) {
      const { api, calls } = fakeApi();
      const before = openProjectWith(mode);
      expect(await retryLockFlow(api, before)).toBe(before);
      expect(calls).toEqual([]);
    }
  });
});

describe("checkLockFlow", () => {
  it("leaves a project writable while the lock is held", async () => {
    const { api } = fakeApi({ projectLockState: ok("held") });
    const before = openProjectWith(writable);
    expect(await checkLockFlow(api, before)).toBe(before);
  });

  it("turns a project read-only when the lock was lost", async () => {
    const { api } = fakeApi({ projectLockState: ok("lost") });
    const result = await checkLockFlow(api, openProjectWith(writable));
    expect(result.mode).toEqual(readOnly({ kind: "lockLost" }));
  });

  it("does not raise an alarm when the check itself fails", async () => {
    const { api } = fakeApi({ projectLockState: failure("internal") });
    const before = openProjectWith(writable);
    expect(await checkLockFlow(api, before)).toBe(before);
  });

  it("does not check a project that is already read-only", async () => {
    const { api, calls } = fakeApi();
    const before = openProjectWith(readOnly({ kind: "newerFormat" }));
    expect(await checkLockFlow(api, before)).toBe(before);
    expect(calls).toEqual([]);
  });
});

describe("releaseFlow", () => {
  it("releases the lock of a writable project, and of one whose lock was lost", async () => {
    for (const mode of [writable, readOnly({ kind: "lockLost" })]) {
      const { api, calls } = fakeApi();
      await releaseFlow(api, openProjectWith(mode));
      expect(calls).toEqual([{ command: "releaseProjectLock", args: [7] }]);
    }
  });

  it("does nothing for a project that never held a lock", async () => {
    for (const mode of [
      readOnly({ kind: "liveLock", holder }),
      readOnly({ kind: "newerFormat" }),
      readOnly({ kind: "archived", archived: "2026-09-01T09:00:00Z" }),
    ]) {
      const { api, calls } = fakeApi();
      await releaseFlow(api, openProjectWith(mode));
      expect(calls).toEqual([]);
    }
  });
});
