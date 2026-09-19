import { newProject } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { failure, fakeApi, ok } from "./fakeApi";
import type { OpenedProject } from "./flows";
import type { ReadOnlyReason } from "./mode";
import { reloadProjectFlow } from "./reload";

const ID = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";

function projectYaml(name = "Batch effects"): string {
  const created = newProject(
    { name, appVersion: "0.1.0" },
    { now: () => new Date("2026-09-19T08:30:15Z"), newId: () => ID },
  );
  if (!created.ok) throw new Error(created.error.message);
  return created.value.projectYaml;
}

const file = (text: string) => ({ text, sha256: "h1" });

const holder = {
  host: "lab-pc",
  pid: 1,
  appVersion: "0.1.0",
  opened: "2026-09-19T10:00:00Z",
  heartbeat: "2026-09-19T10:01:00Z",
};

const summary = {
  id: ID,
  name: "Batch effects",
  evidenceInGit: false,
  externalRoots: [],
  archived: null,
};

const opened = (mode: OpenedProject["mode"]): OpenedProject => ({
  folder: 7,
  path: "C:/work/project",
  summary,
  mode,
});

const writable = { kind: "writable" } as const;
const readOnly = (reason: ReadOnlyReason): OpenedProject["mode"] => ({
  kind: "readOnly",
  reason,
});

describe("reloading project.yaml after an outside edit", () => {
  it("shows the new name and changes nothing else about a writable project", async () => {
    const { api, names } = fakeApi();
    const result = await reloadProjectFlow(
      api,
      opened(writable),
      file(projectYaml("Renamed elsewhere")),
    );
    expect(result.summary?.name).toBe("Renamed elsewhere");
    expect(result.mode).toEqual(writable);
    expect(names()).toEqual([]);
  });

  it("does not disturb a project that is read-only for a reason the file did not cause", async () => {
    const { api, names } = fakeApi();
    const mode = readOnly({ kind: "liveLock", holder });
    const result = await reloadProjectFlow(
      api,
      opened(mode),
      file(projectYaml("Renamed")),
    );
    expect(result.mode).toEqual(mode);
    expect(result.summary?.name).toBe("Renamed");
    expect(names()).toEqual([]);
  });

  it("turns a writable project read-only when the file was archived, and lets go of the lock", async () => {
    const { api, calls } = fakeApi();
    const text = projectYaml().replace(
      "archived: null",
      'archived: "2026-09-19T09:00:00Z"',
    );
    const result = await reloadProjectFlow(api, opened(writable), file(text));
    expect(result.mode).toEqual(
      readOnly({ kind: "archived", archived: "2026-09-19T09:00:00Z" }),
    );
    expect(calls).toEqual([{ command: "releaseProjectLock", args: [7] }]);
  });

  it("turns a writable project read-only when the file is now from a newer version", async () => {
    const { api, names } = fakeApi();
    const text = projectYaml().replace(
      "format_version: 1",
      "format_version: 2",
    );
    const result = await reloadProjectFlow(api, opened(writable), file(text));
    expect(result.mode).toEqual(readOnly({ kind: "newerFormat" }));
    expect(result.summary).toBeNull();
    expect(names()).toEqual(["releaseProjectLock"]);
  });

  it("turns a writable project read-only when the file is no longer valid", async () => {
    const { api, names } = fakeApi();
    const result = await reloadProjectFlow(
      api,
      opened(writable),
      file("format_version: 1\nnot: a project\n"),
    );
    expect(result.mode).toEqual(readOnly({ kind: "invalidProject" }));
    expect(result.summary).toBeNull();
    expect(names()).toEqual(["releaseProjectLock"]);
  });

  it("treats a removed file as an invalid project", async () => {
    const { api, names } = fakeApi();
    const result = await reloadProjectFlow(api, opened(writable), null);
    expect(result.mode).toEqual(readOnly({ kind: "invalidProject" }));
    expect(result.summary).toBeNull();
    expect(names()).toEqual(["releaseProjectLock"]);
  });

  it("does not release a lock the project did not hold", async () => {
    const { api, names } = fakeApi();
    const result = await reloadProjectFlow(
      api,
      opened(readOnly({ kind: "liveLock", holder })),
      file("nonsense: true\n"),
    );
    expect(result.mode).toEqual(readOnly({ kind: "invalidProject" }));
    expect(names()).toEqual([]);
  });

  it("asks for the lock again once a file that made the project read-only is fixed", async () => {
    const { api, calls } = fakeApi();
    const result = await reloadProjectFlow(
      api,
      { ...opened(readOnly({ kind: "invalidProject" })), summary: null },
      file(projectYaml()),
    );
    expect(calls).toEqual([
      { command: "acquireProjectLock", args: [7, false] },
    ]);
    expect(result.mode).toEqual(writable);
    expect(result.summary?.name).toBe("Batch effects");
  });

  it("asks for the lock again when an archived project is restored", async () => {
    const { api, names } = fakeApi();
    const result = await reloadProjectFlow(
      api,
      opened(readOnly({ kind: "archived", archived: "2026-09-01T00:00:00Z" })),
      file(projectYaml()),
    );
    expect(names()).toEqual(["acquireProjectLock"]);
    expect(result.mode).toEqual(writable);
  });

  it("stays read-only if the lock cannot be had once the file is fixed", async () => {
    const { api } = fakeApi({
      acquireProjectLock: ok({ kind: "live", holder }),
    });
    const result = await reloadProjectFlow(
      api,
      opened(readOnly({ kind: "newerFormat" })),
      file(projectYaml()),
    );
    expect(result.mode).toEqual(readOnly({ kind: "liveLock", holder }));
  });

  it("stays read-only, never writable, if the lock cannot be asked for", async () => {
    const { api } = fakeApi({ acquireProjectLock: failure("lockFailed") });
    const result = await reloadProjectFlow(
      api,
      opened(readOnly({ kind: "invalidProject" })),
      file(projectYaml()),
    );
    expect(result.mode).toEqual(readOnly({ kind: "lockUnavailable" }));
  });

  it("puts the file's reason before the lock, as on opening", async () => {
    const { api, names } = fakeApi();
    const text = projectYaml().replace(
      "archived: null",
      'archived: "2026-09-19T09:00:00Z"',
    );
    const result = await reloadProjectFlow(
      api,
      opened(readOnly({ kind: "invalidProject" })),
      file(text),
    );
    expect(result.mode).toEqual(
      readOnly({ kind: "archived", archived: "2026-09-19T09:00:00Z" }),
    );
    expect(names()).toEqual([]);
  });

  it("does not change the project it was given", async () => {
    const { api } = fakeApi();
    const project = opened(writable);
    const before = structuredClone(project);
    await reloadProjectFlow(api, project, file(projectYaml("Other")));
    expect(project).toEqual(before);
  });
});
