import { describe, expect, it, vi } from "vitest";
import type {
  BackupMade,
  FolderHandle,
  ProjectError,
} from "../../../ipc/bindings";
import {
  createFirstWriteGuard,
  needsVersionBackup,
  type Api,
} from "./version-backup";

const FOLDER: FolderHandle = 1;
const MADE: BackupMade = {
  folder: "_notebook/backups/2026-09-21T10-15-00Z-before-0.2.0",
  copied: 7,
  skipped: 0,
};

/** A backup command that answers in turn and counts its calls. */
function fakeApi(
  ...answers: Array<{ status: "ok" } | { status: "error"; error: ProjectError }>
) {
  const calls: FolderHandle[] = [];
  const queue = [...answers];
  const api: Api = {
    backupForVersionChange: (folder) => {
      calls.push(folder);
      const next = queue.shift() ?? { status: "ok" as const };
      return Promise.resolve(
        next.status === "ok"
          ? { status: "ok" as const, data: MADE }
          : { status: "error" as const, error: next.error },
      );
    },
  };
  return { api, calls };
}

describe("needsVersionBackup", () => {
  it("is false when the same version wrote last", () => {
    expect(needsVersionBackup("0.2.0", "0.2.0")).toBe(false);
  });

  it("is true for a newer, an older or a pre-release version", () => {
    expect(needsVersionBackup("0.1.0", "0.2.0")).toBe(true);
    expect(needsVersionBackup("0.3.0", "0.2.0")).toBe(true);
    expect(needsVersionBackup("0.2.0-beta.1", "0.2.0")).toBe(true);
  });
});

describe("the first-write guard", () => {
  it("lets a write go ahead without a backup when the version is the same", async () => {
    const { api, calls } = fakeApi();
    const guard = createFirstWriteGuard(api, FOLDER, "0.2.0", "0.2.0");
    expect(await guard.beforeWrite()).toEqual({ ok: true, value: null });
    expect(calls).toEqual([]);
  });

  it("makes the backup before the first write by a different version", async () => {
    const { api, calls } = fakeApi();
    const guard = createFirstWriteGuard(api, FOLDER, "0.1.0", "0.2.0");
    expect(await guard.beforeWrite()).toEqual({ ok: true, value: MADE });
    expect(calls).toEqual([FOLDER]);
  });

  it("makes it once, however many writes follow", async () => {
    const { api, calls } = fakeApi();
    const guard = createFirstWriteGuard(api, FOLDER, "0.1.0", "0.2.0");
    await guard.beforeWrite();
    expect(await guard.beforeWrite()).toEqual({ ok: true, value: null });
    expect(await guard.beforeWrite()).toEqual({ ok: true, value: null });
    expect(calls).toHaveLength(1);
  });

  it("shares one backup between writes that start together", async () => {
    const { api, calls } = fakeApi();
    const guard = createFirstWriteGuard(api, FOLDER, "0.1.0", "0.2.0");
    const [a, b] = await Promise.all([
      guard.beforeWrite(),
      guard.beforeWrite(),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(calls).toHaveLength(1);
  });

  it("refuses the write when the backup fails, and says why", async () => {
    const { api } = fakeApi({
      status: "error",
      error: { kind: "notWritable" },
    });
    const guard = createFirstWriteGuard(api, FOLDER, "0.1.0", "0.2.0");
    expect(await guard.beforeWrite()).toEqual({
      ok: false,
      error: { kind: "notWritable" },
    });
  });

  it("tries again on the next write after a failure, and never lets one through unbacked", async () => {
    const { api, calls } = fakeApi(
      { status: "error", error: { kind: "writeFailed" } },
      { status: "error", error: { kind: "writeFailed" } },
      { status: "ok" },
    );
    const guard = createFirstWriteGuard(api, FOLDER, "0.1.0", "0.2.0");
    expect((await guard.beforeWrite()).ok).toBe(false);
    expect((await guard.beforeWrite()).ok).toBe(false);
    expect((await guard.beforeWrite()).ok).toBe(true);
    expect(calls).toHaveLength(3);
    // Once made, it is not made again.
    expect((await guard.beforeWrite()).ok).toBe(true);
    expect(calls).toHaveLength(3);
  });

  it("does not call the command until a write is about to happen", () => {
    const beforeWrite = vi.fn();
    const { api } = fakeApi();
    createFirstWriteGuard(
      {
        backupForVersionChange: (f) => (
          beforeWrite(),
          api.backupForVersionChange(f)
        ),
      },
      FOLDER,
      "0.1.0",
      "0.2.0",
    );
    expect(beforeWrite).not.toHaveBeenCalled();
  });
});
