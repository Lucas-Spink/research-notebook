import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ExperimentChoice } from "./experiments";
import {
  groupByQuestion,
  isInsideProject,
  projectRootsOf,
} from "./project-tree";

const choice = (
  ref: string,
  questionRef: string,
  questionTitle = `Title of ${questionRef}`,
): ExperimentChoice => ({
  id: `id-${ref}`,
  ref,
  title: `Title of ${ref}`,
  questionRef,
  questionTitle,
});

describe("groupByQuestion", () => {
  it("puts each experiment under its question, questions and experiments in order", () => {
    const groups = groupByQuestion([
      choice("EXP-002", "Q-002"),
      choice("EXP-001", "Q-001"),
      choice("EXP-003", "Q-001"),
    ]);

    expect(groups.map((g) => g.questionRef)).toEqual(["Q-001", "Q-002"]);
    expect(groups[0]?.experiments.map((e) => e.ref)).toEqual([
      "EXP-001",
      "EXP-003",
    ]);
    expect(groups[1]?.experiments.map((e) => e.ref)).toEqual(["EXP-002"]);
  });

  it("orders question numbers numerically, not as text", () => {
    const groups = groupByQuestion([
      choice("EXP-001", "Q-10"),
      choice("EXP-002", "Q-2"),
    ]);
    expect(groups.map((g) => g.questionRef)).toEqual(["Q-2", "Q-10"]);
  });

  it("keeps the question's title on its group", () => {
    const [group] = groupByQuestion([choice("EXP-001", "Q-001", "Does X?")]);
    expect(group?.questionTitle).toBe("Does X?");
  });

  it("lists experiments whose question has no file last, as unassigned", () => {
    const groups = groupByQuestion([
      choice("EXP-001", "?", "Unassigned"),
      choice("EXP-002", "Q-001"),
    ]);
    expect(groups.map((g) => g.questionRef)).toEqual(["Q-001", "?"]);
  });

  it("has no groups when there are no experiments", () => {
    expect(groupByQuestion([])).toEqual([]);
  });
});

describe("projectRootsOf", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "rn-vscode-tree-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const makeProject = (at: string) => {
    mkdirSync(join(at, "_notebook"), { recursive: true });
    writeFileSync(join(at, "_notebook", "project.yaml"), "format_version: 2\n");
  };

  it("finds a project that is the workspace folder itself", () => {
    makeProject(dir);
    expect(projectRootsOf([dir], existsSync)).toEqual([dir]);
  });

  it("finds the project above a workspace folder opened inside it", () => {
    makeProject(dir);
    mkdirSync(join(dir, "scripts"));
    expect(projectRootsOf([join(dir, "scripts")], existsSync)).toEqual([dir]);
  });

  it("lists a project once however many workspace folders are in it", () => {
    makeProject(dir);
    mkdirSync(join(dir, "a"));
    mkdirSync(join(dir, "b"));
    expect(
      projectRootsOf([join(dir, "a"), join(dir, "b")], existsSync),
    ).toEqual([dir]);
  });

  it("finds one project for each workspace folder that has one, and skips the rest", () => {
    const first = join(dir, "first");
    const second = join(dir, "second");
    const none = join(dir, "none");
    for (const p of [first, second, none]) mkdirSync(p);
    makeProject(first);
    makeProject(second);
    expect(projectRootsOf([first, none, second], existsSync)).toEqual([
      first,
      second,
    ]);
  });
});

describe("isInsideProject", () => {
  const root = join(tmpdir(), "rn-project");

  it("accepts a file inside the project, however deep", () => {
    expect(isInsideProject(root, join(root, "plot.png"))).toBe(true);
    expect(isInsideProject(root, join(root, "results", "a", "plot.png"))).toBe(
      true,
    );
  });

  it("refuses a file beside or above the project", () => {
    expect(isInsideProject(root, join(dirname(root), "plot.png"))).toBe(false);
    expect(isInsideProject(root, join(root, "..", "elsewhere", "a.png"))).toBe(
      false,
    );
  });

  it("refuses a folder that only shares the project's name as a prefix", () => {
    expect(isInsideProject(root, `${root}-other${join("/", "plot.png")}`)).toBe(
      false,
    );
  });

  it("accepts a file whose name merely starts with two dots", () => {
    expect(isInsideProject(root, join(root, "..notes.txt"))).toBe(true);
  });

  it("refuses the project folder itself, which is not a file in it", () => {
    expect(isInsideProject(root, root)).toBe(false);
  });
});
