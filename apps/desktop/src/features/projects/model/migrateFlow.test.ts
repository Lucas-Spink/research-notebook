import {
  newProject,
  parseProject,
  serialiseArtefacts,
  serialiseProject,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { migrateProjectFlow, type MigrateApi } from "./migrateFlow";

/**
 * ADR-0064 and spec 5.13: an older project is migrated only after the person
 * confirms and a version-change backup exists; `project.yaml` is written last
 * so an interrupted migration can simply be run again.
 */

const FOLDER = 4;
const PROJECT_PATH = "_notebook/project.yaml";
const ARTEFACTS = (folder: string) =>
  `_notebook/experiments/${folder}/artefacts.yaml`;

function projectText(): string {
  const made = newProject(
    { name: "Batch effects", appVersion: "0.1.0" },
    {
      now: () => new Date("2026-09-19T08:30:15Z"),
      newId: () => "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
    },
  );
  if (!made.ok) throw new Error(made.error.message);
  return serialiseProject(made.value.project);
}

const toV1 = (text: string) =>
  text.replace("format_version: 2", "format_version: 1");
const EMPTY_ARTEFACTS = serialiseArtefacts({
  format_version: 2,
  artefacts: [],
  groups: [],
});

type Options = {
  files?: Record<string, string>;
  lock?: "acquired" | "live";
  backup?: "ok" | "error";
  write?: Record<string, "changed" | "error">;
  folders?: string[];
};

function fakeApi(options: Options = {}) {
  const files: Record<string, string> = options.files ?? {
    [PROJECT_PATH]: toV1(projectText()),
    [ARTEFACTS("EXP-001")]: toV1(EMPTY_ARTEFACTS),
    [ARTEFACTS("EXP-002")]: toV1(EMPTY_ARTEFACTS),
  };
  const calls: string[] = [];
  const written: string[] = [];
  const api = {
    acquireProjectLock: () => {
      calls.push("lock");
      return Promise.resolve({
        status: "ok",
        data: { kind: options.lock ?? "acquired" },
      });
    },
    releaseProjectLock: () => {
      calls.push("release");
      return Promise.resolve({ status: "ok", data: null });
    },
    backupForVersionChange: () => {
      calls.push("backup");
      return Promise.resolve(
        options.backup === "error"
          ? { status: "error", error: { kind: "internal" } }
          : { status: "ok", data: { path: "backups/x" } },
      );
    },
    listNotebookFiles: () =>
      Promise.resolve({
        status: "ok",
        data: {
          questionFiles: [],
          experimentFolders: options.folders ?? ["EXP-001", "EXP-002"],
        },
      }),
    readNotebookFile: (_folder: unknown, path: string) => {
      const text = files[path];
      return Promise.resolve({
        status: "ok",
        data:
          text === undefined
            ? { kind: "missing" }
            : { kind: "text", text, sha256: `sha:${path}` },
      });
    },
    writeNotebookFile: (
      _folder: unknown,
      path: string,
      text: string,
      expected: { kind: string; sha256?: string },
    ) => {
      written.push(path);
      const forced = options.write?.[path];
      if (forced === "error") {
        return Promise.resolve({
          status: "error",
          error: { kind: "internal" },
        });
      }
      if (forced === "changed" || expected.sha256 !== `sha:${path}`) {
        return Promise.resolve({ status: "ok", data: { kind: "changed" } });
      }
      files[path] = text;
      return Promise.resolve({
        status: "ok",
        data: { kind: "saved", snapshot: null },
      });
    },
  };
  return { api: api as unknown as MigrateApi, calls, written, files };
}

const run = (api: MigrateApi, confirmed = true) =>
  migrateProjectFlow({ api, folder: FOLDER, confirmed });

describe("migrateProjectFlow", () => {
  it("writes nothing and asks for no lock until the person has confirmed", async () => {
    const { api, calls, written } = fakeApi();
    expect(await run(api, false)).toEqual({ ok: false, error: "notConfirmed" });
    expect(calls).toEqual([]);
    expect(written).toEqual([]);
  });

  it("locks, backs up, then writes each artefacts file and project.yaml last", async () => {
    const { api, calls, written, files } = fakeApi();
    expect(await run(api)).toEqual({ ok: true, value: { untouched: [] } });
    expect(calls.slice(0, 2)).toEqual(["lock", "backup"]);
    expect(written).toEqual([
      ARTEFACTS("EXP-001"),
      ARTEFACTS("EXP-002"),
      PROJECT_PATH,
    ]);
    expect(files[PROJECT_PATH]).toContain("format_version: 2");
    expect(files[ARTEFACTS("EXP-001")]).toContain("format_version: 2");
  });

  it("keeps the lock when it succeeds, so the project can open writable", async () => {
    const { api, calls } = fakeApi();
    await run(api);
    expect(calls).not.toContain("release");
  });

  it("changes only the version digit of each file", async () => {
    const original = toV1(projectText());
    const { api, files } = fakeApi();
    await run(api);
    expect(files[PROJECT_PATH]).toBe(
      original.replace("format_version: 1", "format_version: 2"),
    );
  });

  it("does nothing, and says so, when another window holds the lock", async () => {
    const { api, calls, written } = fakeApi({ lock: "live" });
    expect(await run(api)).toEqual({ ok: false, error: "lockUnavailable" });
    expect(calls).toEqual(["lock"]);
    expect(written).toEqual([]);
  });

  it("writes nothing and releases the lock when the backup cannot be made", async () => {
    const { api, calls, written } = fakeApi({ backup: "error" });
    expect(await run(api)).toEqual({ ok: false, error: "backupFailed" });
    expect(calls).toEqual(["lock", "backup", "release"]);
    expect(written).toEqual([]);
  });

  it("refuses an archived project: unarchiving performs its migration (spec 5.13 rule 5)", async () => {
    const archived = toV1(projectText()).replace(
      "archived: null",
      'archived: "2026-10-01T09:00:00Z"',
    );
    const { api, calls, written } = fakeApi({
      files: { [PROJECT_PATH]: archived },
      folders: [],
    });
    expect(await run(api)).toEqual({ ok: false, error: "archived" });
    expect(written).toEqual([]);
    expect(calls.at(-1)).toBe("release");
  });

  it("refuses a project.yaml that is not valid once migrated, writing nothing", async () => {
    const { api, written } = fakeApi({
      files: { [PROJECT_PATH]: 'format_version: 1\nname: "x"\n' },
      folders: [],
    });
    expect(await run(api)).toEqual({ ok: false, error: "invalidProject" });
    expect(written).toEqual([]);
  });

  it("leaves an artefacts file that is not valid untouched and reports it", async () => {
    const { api, written, files } = fakeApi({
      files: {
        [PROJECT_PATH]: toV1(projectText()),
        [ARTEFACTS("EXP-001")]: "format_version: 1\nartefacts: [not, valid\n",
        [ARTEFACTS("EXP-002")]: toV1(EMPTY_ARTEFACTS),
      },
    });
    expect(await run(api)).toEqual({
      ok: true,
      value: { untouched: [ARTEFACTS("EXP-001")] },
    });
    expect(written).not.toContain(ARTEFACTS("EXP-001"));
    expect(files[ARTEFACTS("EXP-001")]).toBe(
      "format_version: 1\nartefacts: [not, valid\n",
    );
  });

  it("stops without touching project.yaml if a file changed underneath, so it can be run again", async () => {
    const { api, written, files, calls } = fakeApi({
      write: { [ARTEFACTS("EXP-002")]: "changed" },
    });
    expect(await run(api)).toEqual({ ok: false, error: "changed" });
    expect(written).not.toContain(PROJECT_PATH);
    expect(files[PROJECT_PATH]).toContain("format_version: 1");
    expect(calls.at(-1)).toBe("release");
  });

  it("is safe to run again after an interruption", async () => {
    const first = fakeApi({ write: { [ARTEFACTS("EXP-002")]: "error" } });
    expect((await run(first.api)).ok).toBe(false);
    const second = fakeApi({ files: first.files });
    expect(await run(second.api)).toEqual({
      ok: true,
      value: { untouched: [] },
    });
    expect(parseProject(second.files[PROJECT_PATH] ?? "").ok).toBe(true);
  });

  it("does nothing for a project already at the current version", async () => {
    const { api, written, calls } = fakeApi({
      files: { [PROJECT_PATH]: projectText() },
      folders: [],
    });
    expect(await run(api)).toEqual({ ok: false, error: "alreadyCurrent" });
    expect(written).toEqual([]);
    expect(calls.at(-1)).toBe("release");
  });
});
