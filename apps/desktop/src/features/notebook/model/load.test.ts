import { describe, expect, it } from "vitest";
import { fakeProject, filesOf, sampleNotebook } from "./fakeApi";
import { loadNotebook } from "./load";

/** Reading a project's questions and experiments from disk (S2-T10). */

function loaded() {
  const sample = sampleNotebook();
  const project = fakeProject(filesOf(sample.state));
  return { sample, project };
}

type Project = ReturnType<typeof loaded>["project"];

describe("loadNotebook", () => {
  it("reads project.yaml, every question and every experiment, with their hashes", async () => {
    const { sample, project } = loaded();
    const result = await loadNotebook(project.read, 1);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state).toEqual(sample.state);
    expect(Object.keys(result.value.hashes).sort()).toEqual(
      [
        "_notebook/project.yaml",
        "_notebook/questions/Q-001.md",
        "_notebook/questions/Q-002.md",
        "_notebook/experiments/EXP-001/experiment.md",
        "_notebook/experiments/EXP-001/artefacts.yaml",
        "_notebook/experiments/EXP-002/experiment.md",
        "_notebook/experiments/EXP-002/artefacts.yaml",
      ].sort(),
    );
    expect(result.value.hashes["_notebook/questions/Q-001.md"]).toBe(
      project.hash("_notebook/questions/Q-001.md"),
    );
  });

  it("reads each experiment's artefacts.yaml into the state (ADR-0044)", async () => {
    const { project } = loaded();
    const result = await loadNotebook(project.read, 1);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.artefacts?.["EXP-001"]).toEqual({
      kind: "file",
      file: { format_version: 1, artefacts: [], groups: [] },
    });
    expect(
      result.value.hashes["_notebook/experiments/EXP-001/artefacts.yaml"],
    ).toBe(project.hash("_notebook/experiments/EXP-001/artefacts.yaml"));
  });

  it("reports an artefacts.yaml it cannot parse, holds no hash for it and marks that evidence unreadable", async () => {
    const { project } = loaded();
    const path = "_notebook/experiments/EXP-001/artefacts.yaml";
    project.disk[path] = "format_version: 1\nartefacts: [not, valid\n";
    const result = await loadNotebook(project.read, 1);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.artefacts?.["EXP-001"]).toEqual({
      kind: "unreadable",
    });
    expect(result.value.state.unreadable).toEqual([path]);
    expect(result.value.hashes).not.toHaveProperty(path);
    expect(result.value.state.experiments).toHaveLength(2);
  });

  it("gives an experiment with no artefacts.yaml no entry, which reads as no evidence yet", async () => {
    const { project } = loaded();
    delete project.disk["_notebook/experiments/EXP-002/artefacts.yaml"];
    const result = await loadNotebook(project.read, 1);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.artefacts).not.toHaveProperty("EXP-002");
    expect(result.value.state.unreadable).toEqual([]);
  });

  it("writes nothing", async () => {
    const { project } = loaded();
    await loadNotebook(project.read, 1);
    expect(
      project.calls.every((c) => c === "list" || c.startsWith("read ")),
    ).toBe(true);
  });

  it("leaves out a file that could not be read, reports it and keeps its ref", async () => {
    const { project } = loaded();
    project.disk["_notebook/questions/Q-007.md"] = "not a question at all";
    project.disk["_notebook/experiments/EXP-009/experiment.md"] = "---\nbroken";
    const result = await loadNotebook(project.read, 1);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.questions.map((q) => q.fileName)).toEqual([
      "Q-001.md",
      "Q-002.md",
    ]);
    expect(result.value.state.unreadable).toEqual([
      "_notebook/questions/Q-007.md",
      "_notebook/experiments/EXP-009/experiment.md",
    ]);
    expect(result.value.state.reservedRefs).toEqual(["Q-007", "EXP-009"]);
    expect(result.value.hashes).not.toHaveProperty(
      "_notebook/questions/Q-007.md",
    );
  });

  it("treats a file the disk refuses to read the same way", async () => {
    const { project } = loaded();
    project.faults.failRead.add("_notebook/experiments/EXP-002/experiment.md");
    const result = await loadNotebook(project.read, 1);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.experiments).toHaveLength(1);
    expect(result.value.state.unreadable).toEqual([
      "_notebook/experiments/EXP-002/experiment.md",
    ]);
    expect(result.value.state.reservedRefs).toEqual(["EXP-002"]);
  });

  it("keeps the ref of a folder that has no experiment.md", async () => {
    const { project } = loaded();
    project.disk["_notebook/experiments/EXP-005/artefacts.yaml"] =
      "format_version: 1\n";
    const result = await loadNotebook(project.read, 1);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.reservedRefs).toEqual(["EXP-005"]);
    expect(result.value.state.unreadable).toEqual([]);
  });

  it("skips a file that was removed between the listing and the read", async () => {
    const { project } = loaded();
    const list = project.read.listNotebookFiles;
    project.read.listNotebookFiles = async (folder) => {
      const listed = await list(folder);
      delete project.disk["_notebook/questions/Q-002.md"];
      return listed;
    };
    const result = await loadNotebook(project.read, 1);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.questions.map((q) => q.fileName)).toEqual([
      "Q-001.md",
    ]);
    expect(result.value.state.unreadable).toEqual([]);
  });

  it("fails when project.yaml is missing, unreadable or invalid", async () => {
    const breakers: Array<(project: Project) => void> = [
      (p) => {
        delete p.disk["_notebook/project.yaml"];
      },
      (p) => {
        p.faults.failRead.add("_notebook/project.yaml");
      },
      (p) => {
        p.disk["_notebook/project.yaml"] = "format_version: 1\n";
      },
    ];
    for (const breakIt of breakers) {
      const { project } = loaded();
      breakIt(project);
      expect(await loadNotebook(project.read, 1)).toEqual({
        ok: false,
        reason: "projectFile",
      });
    }
  });

  it("fails when the files cannot be listed", async () => {
    const { project } = loaded();
    project.faults.failList = true;
    expect(await loadNotebook(project.read, 1)).toEqual({
      ok: false,
      reason: "unavailable",
    });
  });

  it("loads an empty project", async () => {
    const sample = sampleNotebook();
    const empty = fakeProject({
      "_notebook/project.yaml":
        filesOf(sample.state)["_notebook/project.yaml"] ?? "",
    });
    const result = await loadNotebook(empty.read, 1);
    if (!result.ok) throw new Error(result.reason);
    expect(result.value.state.questions).toEqual([]);
    expect(result.value.state.experiments).toEqual([]);
  });
});
