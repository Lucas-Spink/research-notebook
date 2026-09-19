import { newProject } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import {
  chooseExternalRootFlow,
  createFlow,
  externalRootsFlow,
  locateFlow,
  openFlow,
  openRecentFlow,
} from "./flows";
import { failure, fakeApi, ok } from "./fakeApi";

const ID = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";
const OTHER_ID = "01JAXA1C5D8E2F4G6H7J9K0M1N";
const ROOT_ID = "01JAXQ8M3K7T2V9R4W6Y5Z0B1C";

const holder = {
  host: "lab-pc",
  pid: 1,
  appVersion: "0.1.0",
  opened: "2026-09-19T10:00:00Z",
  heartbeat: "2026-09-19T10:01:00Z",
};

const env = {
  now: () => new Date("2026-09-19T08:30:15Z"),
  newId: () => ID,
};

function yamlFor(id: string, name = "Batch effects"): string {
  const created = newProject(
    { name, appVersion: "0.1.0" },
    { ...env, newId: () => id },
  );
  if (!created.ok) throw new Error(created.error.message);
  return created.value.projectYaml;
}

const opened = (id: string, text = yamlFor(id)) =>
  ok({ folder: 7, path: "C:/work/project", projectYaml: text });

const created = (hygiene: { file: string; status: string }[] = []) =>
  ok({ folder: 3, path: "C:/work/new", hygiene });

describe("createFlow", () => {
  it("builds the files with the injected clock, sends them, then remembers the project", async () => {
    const { api, calls } = fakeApi({
      createProject: created([
        { file: ".gitignore", status: "added" },
        { file: ".gitattributes", status: "unchanged" },
      ]),
    });

    const outcome = await createFlow(api, "Batch effects", env);

    const create = calls.find((c) => c.command === "createProject");
    expect(create?.args).toEqual([yamlFor(ID), "[]\n", false]);
    expect(calls.find((c) => c.command === "rememberProject")?.args).toEqual([
      3,
      ID,
      "Batch effects",
    ]);
    expect(calls.find((c) => c.command === "acquireProjectLock")?.args).toEqual(
      [3, false],
    );
    expect(outcome).toEqual({
      kind: "opened",
      project: {
        folder: 3,
        path: "C:/work/new",
        summary: {
          id: ID,
          name: "Batch effects",
          evidenceInGit: false,
          externalRoots: [],
          archived: null,
        },
        mode: { kind: "writable" },
      },
      warnings: [],
    });
  });

  it("does nothing when the person cancels the folder dialog", async () => {
    const { api, names } = fakeApi();
    expect(await createFlow(api, "Batch effects", env)).toEqual({
      kind: "cancelled",
    });
    expect(names()).not.toContain("rememberProject");
    expect(names()).not.toContain("acquireProjectLock");
  });

  it("locks the new project before it is remembered", async () => {
    const { api, names } = fakeApi({ createProject: created() });
    await createFlow(api, "Batch effects", env);
    expect(names()).toEqual([
      "appVersion",
      "createProject",
      "acquireProjectLock",
      "rememberProject",
    ]);
  });

  it("refuses an invalid name before asking for a folder", async () => {
    const { api, names } = fakeApi();
    expect(await createFlow(api, "   ", env)).toEqual({
      kind: "failed",
      reason: "invalidName",
    });
    expect(names()).toEqual(["appVersion"]);
  });

  it("reports why the project could not be created", async () => {
    const { api, names } = fakeApi({ createProject: failure("alreadyInUse") });
    expect(await createFlow(api, "Batch effects", env)).toEqual({
      kind: "failed",
      reason: "alreadyInUse",
    });
    expect(names()).not.toContain("rememberProject");
  });

  it("still opens the project and warns when a repository file could not be updated", async () => {
    const { api } = fakeApi({
      createProject: created([
        { file: ".gitignore", status: "failed" },
        { file: ".gitattributes", status: "added" },
      ]),
    });
    const outcome = await createFlow(api, "Batch effects", env);
    expect(outcome.kind).toBe("opened");
    if (outcome.kind === "opened") {
      expect(outcome.warnings).toEqual([
        { kind: "hygieneFailed", files: [".gitignore"] },
      ]);
    }
  });

  it("still opens the project and warns when it could not be added to the recent list", async () => {
    const { api } = fakeApi({
      createProject: created(),
      rememberProject: failure("settingsDamaged"),
    });
    const outcome = await createFlow(api, "Batch effects", env);
    expect(outcome.kind).toBe("opened");
    if (outcome.kind === "opened") {
      expect(outcome.warnings).toEqual([
        { kind: "notRemembered", reason: "settingsDamaged" },
      ]);
    }
  });
});

describe("openFlow", () => {
  it("reads the project and remembers it", async () => {
    const { api, calls } = fakeApi({ openProject: opened(ID) });
    const outcome = await openFlow(api);
    expect(calls.find((c) => c.command === "rememberProject")?.args).toEqual([
      7,
      ID,
      "Batch effects",
    ]);
    expect(outcome.kind).toBe("opened");
  });

  it("does nothing when cancelled", async () => {
    const { api, names } = fakeApi();
    expect(await openFlow(api)).toEqual({ kind: "cancelled" });
    expect(names()).toEqual(["openProject"]);
  });

  it("reports a folder without a project", async () => {
    const { api } = fakeApi({ openProject: failure("notAProject") });
    expect(await openFlow(api)).toEqual({
      kind: "failed",
      reason: "notAProject",
    });
  });

  it("locks the project and opens it writable when the lock is acquired", async () => {
    const { api, calls } = fakeApi({ openProject: opened(ID) });
    const outcome = await openFlow(api);
    expect(calls.find((c) => c.command === "acquireProjectLock")?.args).toEqual(
      [7, false],
    );
    expect(outcome.kind === "opened" && outcome.project.mode).toEqual({
      kind: "writable",
    });
  });

  it("opens read-only, and still remembers the project, when another instance holds a live lock", async () => {
    const { api, names } = fakeApi({
      openProject: opened(ID),
      acquireProjectLock: ok({ kind: "live", holder }),
    });
    const outcome = await openFlow(api);
    expect(outcome.kind === "opened" && outcome.project.mode).toEqual({
      kind: "readOnly",
      reason: { kind: "liveLock", holder },
    });
    expect(names()).toContain("rememberProject");
  });

  it("opens read-only when the lock cannot be asked for, rather than writable", async () => {
    const { api } = fakeApi({
      openProject: opened(ID),
      acquireProjectLock: failure("lockFailed"),
    });
    const outcome = await openFlow(api);
    expect(outcome.kind === "opened" && outcome.project.mode).toEqual({
      kind: "readOnly",
      reason: { kind: "lockUnavailable" },
    });
  });

  it("opens an archived project read-only and never asks for a lock", async () => {
    const text = yamlFor(ID).replace(
      "archived: null",
      'archived: "2026-09-01T09:00:00Z"',
    );
    const { api, names } = fakeApi({ openProject: opened(ID, text) });
    const outcome = await openFlow(api);
    expect(outcome.kind === "opened" && outcome.project.mode).toEqual({
      kind: "readOnly",
      reason: { kind: "archived", archived: "2026-09-01T09:00:00Z" },
    });
    expect(names()).not.toContain("acquireProjectLock");
    expect(names()).toContain("rememberProject");
  });

  it("opens a newer format read-only, with no lock and no recent-list entry", async () => {
    const text = yamlFor(ID).replace("format_version: 1", "format_version: 2");
    const { api, names } = fakeApi({ openProject: opened(ID, text) });
    const outcome = await openFlow(api);
    expect(outcome).toEqual({
      kind: "opened",
      project: {
        folder: 7,
        path: "C:/work/project",
        summary: null,
        mode: { kind: "readOnly", reason: { kind: "newerFormat" } },
      },
      warnings: [],
    });
    expect(names()).toEqual(["openProject"]);
  });

  it("opens an invalid project.yaml read-only, with no lock and no recent-list entry", async () => {
    const { api, names } = fakeApi({ openProject: opened(ID, "nonsense: [") });
    const outcome = await openFlow(api);
    expect(outcome.kind === "opened" && outcome.project.mode).toEqual({
      kind: "readOnly",
      reason: { kind: "invalidProject" },
    });
    expect(names()).toEqual(["openProject"]);
  });
});

describe("openRecentFlow", () => {
  it("opens the remembered folder", async () => {
    const { api, calls } = fakeApi({ openRecentProject: opened(ID) });
    const outcome = await openRecentFlow(api, ID);
    expect(calls[0]).toEqual({ command: "openRecentProject", args: [ID] });
    expect(outcome.kind).toBe("opened");
  });

  it("reports a folder that has gone so the person can locate it", async () => {
    const { api } = fakeApi({
      openRecentProject: failure("folderUnavailable"),
    });
    expect(await openRecentFlow(api, ID)).toEqual({
      kind: "failed",
      reason: "folderUnavailable",
    });
  });

  it("refuses a folder that now holds a different project, without locking it", async () => {
    const { api, names } = fakeApi({ openRecentProject: opened(OTHER_ID) });
    expect(await openRecentFlow(api, ID)).toEqual({
      kind: "failed",
      reason: "differentProject",
    });
    expect(names()).not.toContain("rememberProject");
    expect(names()).not.toContain("acquireProjectLock");
  });

  it("opens a remembered project that has since become unreadable, read-only", async () => {
    const text = yamlFor(ID).replace("format_version: 1", "format_version: 2");
    const { api, names } = fakeApi({ openRecentProject: opened(ID, text) });
    const outcome = await openRecentFlow(api, ID);
    expect(outcome.kind === "opened" && outcome.project.mode).toEqual({
      kind: "readOnly",
      reason: { kind: "newerFormat" },
    });
    expect(names()).not.toContain("acquireProjectLock");
  });
});

describe("locateFlow", () => {
  it("records the new path when the folder holds the same project", async () => {
    const { api, calls } = fakeApi({ locateProject: opened(ID) });
    const outcome = await locateFlow(api, ID);
    expect(calls.find((c) => c.command === "rememberProject")?.args).toEqual([
      7,
      ID,
      "Batch effects",
    ]);
    expect(outcome.kind).toBe("opened");
  });

  it("refuses a folder that holds a different project and records nothing", async () => {
    const { api, names } = fakeApi({ locateProject: opened(OTHER_ID) });
    expect(await locateFlow(api, ID)).toEqual({
      kind: "failed",
      reason: "differentProject",
    });
    expect(names()).not.toContain("rememberProject");
  });

  it("refuses a folder whose project cannot be identified, and locks nothing", async () => {
    const text = yamlFor(ID).replace("format_version: 1", "format_version: 2");
    const { api, names } = fakeApi({ locateProject: opened(ID, text) });
    expect(await locateFlow(api, ID)).toEqual({
      kind: "failed",
      reason: "newerFormat",
    });
    expect(names()).toEqual(["locateProject"]);
  });

  it("does nothing when cancelled", async () => {
    const { api, names } = fakeApi();
    expect(await locateFlow(api, ID)).toEqual({ kind: "cancelled" });
    expect(names()).toEqual(["locateProject"]);
  });

  it("reports why a folder cannot be used", async () => {
    const { api } = fakeApi({ locateProject: failure("notAProject") });
    expect(await locateFlow(api, ID)).toEqual({
      kind: "failed",
      reason: "notAProject",
    });
  });
});

describe("externalRootsFlow", () => {
  const summary = {
    id: ID,
    name: "Batch effects",
    evidenceInGit: false,
    externalRoots: [{ id: ROOT_ID, label: "Raw sequencing" }],
    archived: null,
  };
  const unresolved = [
    { id: ROOT_ID, label: "Raw sequencing", path: null, available: false },
  ];

  it("asks for the status of each root the project declares", async () => {
    const { api, calls } = fakeApi({
      externalRootStatus: ok([
        { rootId: ROOT_ID, path: null, available: false },
      ]),
    });
    const roots = await externalRootsFlow(api, summary);
    expect(calls[0]).toEqual({
      command: "externalRootStatus",
      args: [ID, [ROOT_ID]],
    });
    expect(roots).toEqual(unresolved);
  });

  it("shows where a root is on this machine", async () => {
    const { api } = fakeApi({
      externalRootStatus: ok([
        { rootId: ROOT_ID, path: "D:/raw", available: true },
      ]),
    });
    expect(await externalRootsFlow(api, summary)).toEqual([
      { id: ROOT_ID, label: "Raw sequencing", path: "D:/raw", available: true },
    ]);
  });

  it("does not ask when the project has no external roots", async () => {
    const { api, names } = fakeApi();
    expect(
      await externalRootsFlow(api, { ...summary, externalRoots: [] }),
    ).toEqual([]);
    expect(names()).toEqual([]);
  });

  it("shows every declared root as unresolved when the settings cannot be read", async () => {
    const { api } = fakeApi({
      externalRootStatus: failure("settingsDamaged"),
    });
    expect(await externalRootsFlow(api, summary)).toEqual(unresolved);
  });
});

describe("chooseExternalRootFlow", () => {
  const summary = {
    id: ID,
    name: "Batch effects",
    evidenceInGit: false,
    externalRoots: [{ id: ROOT_ID, label: "Raw sequencing" }],
    archived: null,
  };

  it("saves the chosen folder, then reports the roots again", async () => {
    const { api, calls } = fakeApi({
      setExternalRoot: ok("D:/raw"),
      externalRootStatus: ok([
        { rootId: ROOT_ID, path: "D:/raw", available: true },
      ]),
    });
    expect(await chooseExternalRootFlow(api, summary, ROOT_ID)).toEqual({
      roots: [
        {
          id: ROOT_ID,
          label: "Raw sequencing",
          path: "D:/raw",
          available: true,
        },
      ],
    });
    expect(calls[0]).toEqual({
      command: "setExternalRoot",
      args: [ID, ROOT_ID],
    });
  });

  it("changes nothing when the person cancels", async () => {
    const { api, names } = fakeApi({ setExternalRoot: ok(null) });
    expect(await chooseExternalRootFlow(api, summary, ROOT_ID)).toBeNull();
    expect(names()).toEqual(["setExternalRoot"]);
  });

  it("reports why the folder could not be saved", async () => {
    const { api } = fakeApi({ setExternalRoot: failure("settingsNewer") });
    expect(await chooseExternalRootFlow(api, summary, ROOT_ID)).toEqual({
      failure: "settingsNewer",
    });
  });
});
