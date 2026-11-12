import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { locateFile, projectsHolding } from "./source";
import type { KnownProject } from "./known-projects";

const base = join(tmpdir(), "rn-source");
const project = join(base, "project");
const raw = join(base, "raw");
const nested = join(raw, "nested");

describe("locateFile", () => {
  it("puts a file inside the project under the project", () => {
    expect(
      locateFile(join(project, "results", "a.png"), project, [
        { id: "R1", folder: raw },
      ]),
    ).toEqual({ id: "project", folder: project });
  });

  it("puts a file in an external root's folder under that root", () => {
    expect(
      locateFile(join(raw, "run1", "a.csv"), project, [
        { id: "R1", folder: raw },
      ]),
    ).toEqual({ id: "R1", folder: raw });
  });

  it("takes the deepest of the roots that hold the file", () => {
    expect(
      locateFile(join(nested, "a.csv"), project, [
        { id: "R1", folder: raw },
        { id: "R2", folder: nested },
      ]),
    ).toEqual({ id: "R2", folder: nested });
  });

  it("is nothing for a file in neither", () => {
    expect(
      locateFile(join(base, "elsewhere", "a.csv"), project, [
        { id: "R1", folder: raw },
      ]),
    ).toBeUndefined();
  });

  it("does not count a folder that only shares a name prefix", () => {
    expect(
      locateFile(join(base, "raw-other", "a.csv"), project, [
        { id: "R1", folder: raw },
      ]),
    ).toBeUndefined();
  });

  it("does not count the root folder itself, which is not a file in it", () => {
    expect(
      locateFile(raw, project, [{ id: "R1", folder: raw }]),
    ).toBeUndefined();
  });
});

const known = (root: string, ...folders: string[]): KnownProject => ({
  root,
  name: root,
  id: root,
  state: "closed",
  inWorkspace: false,
  externalRoots: folders.map((folder, index) => ({
    id: `R${index}`,
    label: folder,
    folder,
  })),
});

describe("projectsHolding", () => {
  it("finds the projects whose folder or external root holds the file", () => {
    const a = known(project, raw);
    const b = known(join(base, "other"));
    expect(
      projectsHolding(join(raw, "a.csv"), [a, b]).map((p) => p.root),
    ).toEqual([project]);
    expect(
      projectsHolding(join(project, "a.csv"), [a, b]).map((p) => p.root),
    ).toEqual([project]);
  });

  it("returns several when a folder is an external root of more than one", () => {
    const a = known(join(base, "a"), raw);
    const b = known(join(base, "b"), raw);
    expect(projectsHolding(join(raw, "x.csv"), [a, b])).toHaveLength(2);
  });

  it("returns none when no project holds it", () => {
    expect(projectsHolding(join(base, "x.csv"), [known(project)])).toEqual([]);
  });
});
