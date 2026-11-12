import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { describe, expect, it } from "vitest";

import { knownProjects, type Deps, type ProjectInfo } from "./known-projects";
import type { StrataSettings } from "./strata-settings";

const NOW = new Date("2026-11-12T12:00:00Z");

/** A project folder on this machine, whatever its path separator. */
const at = (name: string): string => join(tmpdir(), "rn-known", name);

type Lock = "open" | "stale" | "partial" | "none";

const lockText = (lock: Lock): string | undefined => {
  if (lock === "none") return undefined;
  if (lock === "partial") return '{"host":"pc","pi';
  return JSON.stringify({
    host: "pc",
    pid: 1,
    app_version: "0.1.3",
    opened: "2026-11-12T09:00:00Z",
    heartbeat:
      lock === "open" ? "2026-11-12T11:59:30Z" : "2026-11-12T08:00:00Z",
  });
};

/** A world of project folders: each may have readable project info and a lock. */
function world(
  projects: Record<string, { info?: ProjectInfo; lock?: Lock }>,
): Deps {
  const byRoot = new Map(
    Object.entries(projects).map(([name, project]) => [at(name), project]),
  );
  return {
    exists: (path) =>
      [...byRoot.keys()].some(
        (root) => path === join(root, "_notebook", "project.yaml"),
      ),
    readProject: (root) => byRoot.get(root)?.info,
    readLock: (root) => lockText(byRoot.get(root)?.lock ?? "none"),
    now: NOW,
  };
}

const info = (
  id: string,
  name: string,
  roots: ProjectInfo["roots"] = [],
): ProjectInfo => ({ id, name, roots });

const remembered = (id: string, name: string) => ({
  id,
  name,
  path: at(name.toLowerCase()),
});

const settings = (over: Partial<StrataSettings> = {}): StrataSettings => ({
  recent: [],
  externalRoots: {},
  ...over,
});

describe("knownProjects", () => {
  it("lists a project open in the app under open, a closed one under recent", () => {
    const deps = world({
      alpha: { info: info("A", "Alpha"), lock: "open" },
      beta: { info: info("B", "Beta"), lock: "none" },
    });
    const result = knownProjects(
      [],
      settings({ recent: [remembered("B", "Beta"), remembered("A", "Alpha")] }),
      deps,
    );
    expect(result.open.map((p) => p.name)).toEqual(["Alpha"]);
    expect(result.recent.map((p) => p.name)).toEqual(["Beta"]);
  });

  it("finds several projects open at once, as with several instances", () => {
    const deps = world({
      alpha: { info: info("A", "Alpha"), lock: "open" },
      beta: { info: info("B", "Beta"), lock: "open" },
    });
    const result = knownProjects(
      [],
      settings({ recent: [remembered("A", "Alpha"), remembered("B", "Beta")] }),
      deps,
    );
    expect(result.open.map((p) => p.root)).toEqual([at("alpha"), at("beta")]);
  });

  it("treats a stale lock, left by a crash, as closed", () => {
    const deps = world({
      alpha: { info: info("A", "Alpha"), lock: "stale" },
    });
    const result = knownProjects(
      [],
      settings({ recent: [remembered("A", "Alpha")] }),
      deps,
    );
    expect(result.open).toEqual([]);
    expect(result.recent[0]?.state).toBe("closed");
  });

  it("puts workspace projects first and lists a project once", () => {
    const deps = world({
      alpha: { info: info("A", "Alpha"), lock: "open" },
      beta: { info: info("B", "Beta"), lock: "open" },
    });
    const result = knownProjects(
      [join(at("beta"), "analysis")],
      settings({ recent: [remembered("A", "Alpha"), remembered("B", "Beta")] }),
      deps,
    );
    expect(result.open.map((p) => p.root)).toEqual([at("beta"), at("alpha")]);
    expect(result.open[0]?.inWorkspace).toBe(true);
    expect(result.open[1]?.inWorkspace).toBe(false);
  });

  it("drops a recent project whose folder is gone", () => {
    const deps = world({ alpha: { info: info("A", "Alpha") } });
    const result = knownProjects(
      [],
      settings({
        recent: [
          remembered("A", "Alpha"),
          { id: "Z", name: "Gone", path: at("gone") },
        ],
      }),
      deps,
    );
    expect(result.recent.map((p) => p.name)).toEqual(["Alpha"]);
  });

  it("attaches each external root's label and folder from the settings", () => {
    const deps = world({
      alpha: {
        info: info("A", "Alpha", [
          { id: "R1", label: "Raw data" },
          { id: "R2", label: "Not set here" },
        ]),
      },
    });
    const [project] = knownProjects(
      [],
      settings({
        recent: [remembered("A", "Alpha")],
        externalRoots: { A: { R1: at("data") } },
      }),
      deps,
    ).recent;
    expect(project?.externalRoots).toEqual([
      { id: "R1", label: "Raw data", folder: at("data") },
    ]);
  });

  it("uses the project file's name and id, not the possibly stale remembered ones", () => {
    const deps = world({ alpha: { info: info("A", "Renamed") } });
    const [project] = knownProjects(
      [],
      settings({
        recent: [{ id: "A", name: "Old name", path: at("alpha") }],
      }),
      deps,
    ).recent;
    expect(project?.name).toBe("Renamed");
    expect(project?.id).toBe("A");
  });

  it("still lists a workspace project whose project.yaml cannot be read", () => {
    const deps = world({ alpha: {} });
    const result = knownProjects([at("alpha")], undefined, deps);
    expect(result.recent).toHaveLength(1);
    expect(result.recent[0]).toMatchObject({
      root: at("alpha"),
      name: basename(at("alpha")),
      externalRoots: [],
    });
    expect(result.recent[0]?.id).toBeUndefined();
  });

  it("falls back to the workspace alone when there is no settings file", () => {
    const deps = world({ alpha: { info: info("A", "Alpha"), lock: "open" } });
    const result = knownProjects([at("alpha")], undefined, deps);
    expect(result.open.map((p) => p.root)).toEqual([at("alpha")]);
    expect(result.recent).toEqual([]);
  });

  it("treats a lock it cannot read as not open, and says so", () => {
    const deps = world({
      alpha: { info: info("A", "Alpha"), lock: "partial" },
    });
    const result = knownProjects([at("alpha")], undefined, deps);
    expect(result.open).toEqual([]);
    expect(result.recent[0]?.state).toBe("unknown");
  });
});
