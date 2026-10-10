import {
  newProject,
  parseProject,
  serialiseProject,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import {
  archiveProject,
  unarchiveProject,
  type ArchiveApi,
} from "./archiveProject";

/** FR-ARC-09 and FR-ARC-10: archive writes only the flag; unarchive confirms, locks, backs up, migrates, then writes. */

const FOLDER = 3;
const SHA = "b".repeat(64);
const NOW = () => new Date("2026-10-10T12:34:56.789Z");

function activeText(): string {
  const made = newProject(
    { name: "Batch effects", appVersion: "0.1.0" },
    {
      now: () => new Date("2026-09-19T08:30:15.789Z"),
      newId: () => "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
    },
  );
  if (!made.ok) throw new Error(made.error.message);
  return serialiseProject(made.value.project);
}

function archivedText(): string {
  return activeText().replace(
    "archived: null",
    'archived: "2026-10-01T09:00:00Z"',
  );
}

type Options = {
  text?: string | null;
  lock?: "acquired" | "live";
  backup?: "ok" | "error";
  write?: "saved" | "changed" | "error";
};

function fakeApi(options: Options = {}) {
  const calls: string[] = [];
  const writes: { path: string; text: string; expected: unknown }[] = [];
  const text = options.text === undefined ? activeText() : options.text;
  const api: ArchiveApi = {
    readNotebookFile: () => {
      calls.push("read");
      return Promise.resolve({
        status: "ok",
        data:
          text === null
            ? { kind: "missing" }
            : { kind: "text", text, sha256: SHA },
      });
    },
    writeNotebookFile: (_folder, path, written, expected) => {
      calls.push("write");
      writes.push({ path, text: written, expected });
      if (options.write === "error") {
        return Promise.resolve({
          status: "error",
          error: { kind: "notWritable" },
        });
      }
      return Promise.resolve({
        status: "ok",
        data:
          options.write === "changed"
            ? { kind: "changed", current: SHA }
            : { kind: "saved", snapshot: null },
      });
    },
    backupForVersionChange: () => {
      calls.push("backup");
      return Promise.resolve(
        options.backup === "error"
          ? { status: "error", error: { kind: "writeFailed" } }
          : {
              status: "ok",
              data: { folder: "backups/x", copied: 1, skipped: 0 },
            },
      );
    },
    acquireProjectLock: () => {
      calls.push("lock");
      return Promise.resolve({
        status: "ok",
        data:
          options.lock === "live"
            ? {
                kind: "live",
                holder: {
                  host: "h",
                  pid: 1,
                  appVersion: "0.1.0",
                  opened: "2026-10-10T12:00:00Z",
                  heartbeat: "2026-10-10T12:00:00Z",
                },
              }
            : { kind: "acquired" },
      });
    },
    releaseProjectLock: () => {
      calls.push("release");
      return Promise.resolve({ status: "ok", data: null });
    },
  };
  return { api, calls, writes };
}

describe("archiveProject", () => {
  it("writes project.yaml with only the archived flag changed", async () => {
    const { api, writes } = fakeApi();
    const done = await archiveProject({ api, folder: FOLDER, now: NOW });
    expect(done).toEqual({ ok: true, value: "2026-10-10T12:34:56Z" });
    expect(writes).toHaveLength(1);
    expect(writes[0]?.path).toBe("_notebook/project.yaml");
    expect(writes[0]?.expected).toEqual({ kind: "sha256", sha256: SHA });
    expect(writes[0]?.text).toBe(
      activeText().replace(
        "archived: null",
        'archived: "2026-10-10T12:34:56Z"',
      ),
    );
  });

  it("refuses a project that is already archived, writing nothing", async () => {
    const { api, calls } = fakeApi({ text: archivedText() });
    const done = await archiveProject({ api, folder: FOLDER, now: NOW });
    expect(done).toEqual({ ok: false, error: "alreadyArchived" });
    expect(calls).not.toContain("write");
  });

  it("leaves a project.yaml it cannot parse alone", async () => {
    const { api, calls } = fakeApi({ text: "format_version: [" });
    const done = await archiveProject({ api, folder: FOLDER, now: NOW });
    expect(done).toEqual({ ok: false, error: "unreadable" });
    expect(calls).toEqual(["read"]);
  });

  it("reports a file changed since it was read, as not archived", async () => {
    const { api } = fakeApi({ write: "changed" });
    const done = await archiveProject({ api, folder: FOLDER, now: NOW });
    expect(done).toEqual({ ok: false, error: "changed" });
  });

  it("reports a refused write", async () => {
    const { api } = fakeApi({ write: "error" });
    const done = await archiveProject({ api, folder: FOLDER, now: NOW });
    expect(done).toEqual({ ok: false, error: "writeFailed" });
  });
});

describe("unarchiveProject", () => {
  const base = { folder: FOLDER, appVersion: "0.2.0" };

  it("does nothing at all without confirmation", async () => {
    const { api, calls } = fakeApi({ text: archivedText() });
    const done = await unarchiveProject({ ...base, api, confirmed: false });
    expect(done).toEqual({ ok: false, error: "notConfirmed" });
    expect(calls).toEqual([]);
  });

  it("locks, backs up, then writes, in that order", async () => {
    const { api, calls, writes } = fakeApi({ text: archivedText() });
    const done = await unarchiveProject({ ...base, api, confirmed: true });
    expect(done).toEqual({ ok: true, value: undefined });
    expect(calls).toEqual(["read", "lock", "backup", "write"]);
    const parsed = parseProject(writes[0]?.text ?? "");
    expect(parsed.ok && parsed.value.archived).toBeNull();
    expect(parsed.ok && parsed.value.last_written_by).toBe("0.2.0");
  });

  it("writes nothing when the backup fails, and lets go of the lock", async () => {
    const { api, calls } = fakeApi({ text: archivedText(), backup: "error" });
    const done = await unarchiveProject({ ...base, api, confirmed: true });
    expect(done).toEqual({ ok: false, error: "backupFailed" });
    expect(calls).toEqual(["read", "lock", "backup", "release"]);
  });

  it("writes nothing when another instance holds the lock", async () => {
    const { api, calls } = fakeApi({ text: archivedText(), lock: "live" });
    const done = await unarchiveProject({ ...base, api, confirmed: true });
    expect(done).toEqual({ ok: false, error: "lockUnavailable" });
    expect(calls).toEqual(["read", "lock"]);
  });

  it("refuses a project that is not archived", async () => {
    const { api, calls } = fakeApi();
    const done = await unarchiveProject({ ...base, api, confirmed: true });
    expect(done).toEqual({ ok: false, error: "notArchived" });
    expect(calls).toEqual(["read"]);
  });

  it("never touches a project it cannot parse", async () => {
    const { api, calls } = fakeApi({ text: "format_version: 99\n" });
    const done = await unarchiveProject({ ...base, api, confirmed: true });
    expect(done.ok).toBe(false);
    expect(calls).toEqual(["read"]);
  });

  it("stops before writing if a migration would be needed, which no build has yet", async () => {
    const { api, calls } = fakeApi({ text: archivedText() });
    const done = await unarchiveProject({
      ...base,
      api,
      confirmed: true,
      migrations: [{ from: 1, to: 2, run: (files) => files }],
      target: 2,
    });
    expect(done).toEqual({ ok: false, error: "migrationNeeded" });
    expect(calls).toEqual(["read", "lock", "backup", "release"]);
  });

  it("releases the lock when the write fails", async () => {
    const { api, calls } = fakeApi({ text: archivedText(), write: "error" });
    const done = await unarchiveProject({ ...base, api, confirmed: true });
    expect(done).toEqual({ ok: false, error: "writeFailed" });
    expect(calls.at(-1)).toBe("release");
  });
});
