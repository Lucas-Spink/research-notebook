import {
  createExperiment,
  createQuestion,
  editExperiment,
  moveExperiment,
  parseProject,
  removeExperiment,
  removeQuestion,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../../shared/sha256";
import { external } from "../../conflicts";
import { createFirstWriteGuard } from "../../history";
import {
  FOLDER,
  fakeChanges,
  fakeProject,
  filesOf,
  sampleNotebook,
} from "./fakeApi";
import { loadNotebook } from "./load";
import { perform, type Deps } from "./perform";

/** Carrying out the writes of a plan, in order, safely (S2-T10, ADR-0026). */

const PROJECT = "_notebook/project.yaml";
const EXP_1 = "_notebook/experiments/EXP-001/experiment.md";

async function setup(options: { writable?: boolean } = {}) {
  const sample = sampleNotebook();
  const project = fakeProject(filesOf(sample.state));
  const changes = fakeChanges();
  const result = await loadNotebook(project.read, FOLDER);
  if (!result.ok) throw new Error(result.reason);
  for (const [path, base] of Object.entries(result.value.hashes)) {
    changes.track(path, base);
  }
  const deps = (lastWrittenBy = "0.2.0"): Deps => ({
    api: project.write,
    folder: FOLDER,
    guard: createFirstWriteGuard(project.write, FOLDER, lastWrittenBy, "0.2.0"),
    changes,
    writable: options.writable ?? true,
  });
  return { sample, project, changes, loaded: result.value, deps };
}

/** The calls that change the disk (a backup counts), in order. */
const writes = (calls: string[]) =>
  calls.filter((c) => c !== "list" && !c.startsWith("read "));

describe("perform: creating", () => {
  it("writes an experiment's files first and project.yaml last", async () => {
    const { sample, project, loaded, deps } = await setup();
    project.calls.length = 0;
    const done = await perform(deps(), loaded, (state) =>
      createExperiment(
        state,
        { questionId: sample.second, title: "Three" },
        sample.env,
      ),
    );
    expect(done.kind).toBe("done");
    expect(writes(project.calls)).toEqual([
      "write _notebook/experiments/EXP-003/experiment.md",
      "write _notebook/experiments/EXP-003/artefacts.yaml",
      `write ${PROJECT}`,
    ]);
  });

  it("leaves the new state equal to what a reload of the disk finds", async () => {
    const { sample, project, loaded, deps } = await setup();
    const done = await perform(deps(), loaded, (state) =>
      createQuestion(state, { title: "Third" }, sample.env),
    );
    if (done.kind !== "done") throw new Error(done.kind);
    const reloaded = await loadNotebook(project.read, FOLDER);
    if (!reloaded.ok) throw new Error(reloaded.reason);
    expect(reloaded.value).toEqual(done.loaded);
  });

  it("refuses to overwrite a file that is already there", async () => {
    const { sample, project, loaded, deps } = await setup();
    // A folder EXP-003 appeared on disk after the project was read.
    project.disk["_notebook/experiments/EXP-003/experiment.md"] = "theirs";
    project.calls.length = 0;
    const done = await perform(deps(), loaded, (state) =>
      createExperiment(
        state,
        { questionId: sample.first, title: "Three" },
        sample.env,
      ),
    );
    expect(done).toEqual({
      kind: "interrupted",
      reason: "changed",
      written: 0,
    });
    expect(project.disk["_notebook/experiments/EXP-003/experiment.md"]).toBe(
      "theirs",
    );
    expect(writes(project.calls)).toHaveLength(1);
  });
});

describe("perform: editing, moving and deleting", () => {
  it("replaces an experiment.md only when it is still what was read", async () => {
    const { sample, project, loaded, deps } = await setup();
    project.disk[EXP_1] = `${project.disk[EXP_1] ?? ""}\nedited elsewhere\n`;
    const done = await perform(deps(), loaded, (state) =>
      editExperiment(state, sample.one, { title: "Renamed" }, sample.env),
    );
    expect(done).toEqual({
      kind: "interrupted",
      reason: "changed",
      written: 0,
    });
    expect(project.disk[EXP_1]).toContain("edited elsewhere");
  });

  it("moves an experiment by writing its file and then project.yaml", async () => {
    const { sample, project, loaded, deps } = await setup();
    project.calls.length = 0;
    const done = await perform(deps(), loaded, (state) =>
      moveExperiment(state, sample.one, sample.second, sample.env),
    );
    if (done.kind !== "done") throw new Error(done.kind);
    expect(writes(project.calls)).toEqual([
      `write ${EXP_1}`,
      `write ${PROJECT}`,
    ]);
    const written = parseProject(project.disk[PROJECT] ?? "");
    expect(
      written.ok &&
        written.value.order.find((e) => e.question === sample.second)
          ?.experiments,
    ).toEqual([sample.one]);
  });

  it("deletes an experiment by moving its folder to the trash, then rewriting project.yaml", async () => {
    const { sample, project, loaded, deps } = await setup();
    project.calls.length = 0;
    const done = await perform(deps(), loaded, (state) =>
      removeExperiment(state, sample.one, sample.env),
    );
    if (done.kind !== "done") throw new Error(done.kind);
    expect(writes(project.calls)).toEqual([
      "trash _notebook/experiments/EXP-001",
      `write ${PROJECT}`,
    ]);
    expect(
      Object.keys(project.disk).filter((k) =>
        k.startsWith("_notebook/experiments/EXP-001/"),
      ),
    ).toEqual([]);
    // It went to the trash, not away.
    expect(Object.keys(project.disk)).toContain(
      "_notebook/.trash/2026-09-21T10-15-00Z/experiments/EXP-001/experiment.md",
    );
    expect(done.loaded.hashes).not.toHaveProperty(EXP_1);
  });

  it("deletes a question by trashing its file only", async () => {
    const { sample, project, loaded, deps } = await setup();
    project.calls.length = 0;
    const done = await perform(deps(), loaded, (state) =>
      removeQuestion(state, sample.first, sample.env),
    );
    if (done.kind !== "done") throw new Error(done.kind);
    expect(writes(project.calls)).toEqual([
      "trash _notebook/questions/Q-001.md",
      `write ${PROJECT}`,
    ]);
    expect(project.disk[EXP_1]).toBeDefined();
  });

  it("does nothing when the plan has no steps", async () => {
    const { sample, project, loaded, deps } = await setup();
    project.calls.length = 0;
    const done = await perform(deps(), loaded, (state) =>
      editExperiment(state, sample.one, { title: "One" }, sample.env),
    );
    expect(done).toEqual({ kind: "done", loaded });
    expect(project.calls).toEqual([]);
  });
});

describe("perform: when something goes wrong", () => {
  it("reports a refused operation and writes nothing", async () => {
    const { sample, project, loaded, deps } = await setup();
    project.calls.length = 0;
    const done = await perform(deps(), loaded, (state) =>
      createQuestion(state, { title: "  " }, sample.env),
    );
    expect(done.kind).toBe("refused");
    if (done.kind !== "refused") return;
    expect(done.error).toMatchObject({ kind: "invalid", field: "title" });
    expect(project.calls).toEqual([]);
  });

  it("writes nothing when the project is read-only", async () => {
    const { sample, project, loaded, deps } = await setup({ writable: false });
    project.calls.length = 0;
    const done = await perform(deps(), loaded, (state) =>
      createQuestion(state, { title: "Third" }, sample.env),
    );
    expect(done).toEqual({ kind: "notWritten", reason: "notWritable" });
    expect(project.calls).toEqual([]);
  });

  it("stops before any file is changed if the lock was lost", async () => {
    const { sample, project, loaded, deps } = await setup();
    project.faults.notWritable = true;
    const done = await perform(deps(), loaded, (state) =>
      createQuestion(state, { title: "Third" }, sample.env),
    );
    expect(done).toEqual({ kind: "notWritten", reason: "notWritable" });
    expect(Object.keys(project.disk)).not.toContain(
      "_notebook/questions/Q-003.md",
    );
  });

  it("makes the version-change backup before the first write, and not again", async () => {
    const { sample, project, loaded, deps } = await setup();
    const guarded = deps("0.1.0");
    project.calls.length = 0;
    const first = await perform(guarded, loaded, (state) =>
      createQuestion(state, { title: "Third" }, sample.env),
    );
    if (first.kind !== "done") throw new Error(first.kind);
    expect(project.calls[0]).toBe("backup");
    await perform(guarded, first.loaded, (state) =>
      createQuestion(state, { title: "Fourth" }, sample.env),
    );
    expect(project.calls.filter((c) => c === "backup")).toHaveLength(1);
  });

  it("does not write when the backup fails", async () => {
    const { sample, project, loaded, deps } = await setup();
    project.faults.failBackup = true;
    project.calls.length = 0;
    const done = await perform(deps("0.1.0"), loaded, (state) =>
      createQuestion(state, { title: "Third" }, sample.env),
    );
    expect(done).toEqual({ kind: "notWritten", reason: "backupFailed" });
    expect(project.calls.filter((c) => c.startsWith("write "))).toEqual([]);
  });

  it("records the running version in project.yaml before an edit that would not touch it", async () => {
    const { sample, project, loaded, deps } = await setup();
    const older = {
      ...loaded,
      state: {
        ...loaded.state,
        project: { ...loaded.state.project, last_written_by: "0.1.0" },
      },
    };
    project.calls.length = 0;
    const done = await perform(deps(), older, (state) =>
      editExperiment(state, sample.one, { status: "running" }, sample.env),
    );
    if (done.kind !== "done") throw new Error(done.kind);
    expect(writes(project.calls)).toEqual([
      `write ${PROJECT}`,
      `write ${EXP_1}`,
    ]);
    const written = parseProject(project.disk[PROJECT] ?? "");
    expect(written.ok && written.value.last_written_by).toBe("0.2.0");
  });

  it("reports how many writes were made when one fails part way", async () => {
    const { sample, project, loaded, deps } = await setup();
    project.faults.failWrite.add(PROJECT);
    const done = await perform(deps(), loaded, (state) =>
      createExperiment(
        state,
        { questionId: sample.first, title: "Three" },
        sample.env,
      ),
    );
    expect(done).toEqual({ kind: "interrupted", reason: "failed", written: 2 });
    // The experiment's own files are complete; project.yaml is as it was.
    expect(
      project.disk["_notebook/experiments/EXP-003/experiment.md"],
    ).toBeDefined();
    expect(project.disk[PROJECT]).toBe(filesOf(sample.state)[PROJECT]);
  });

  it("leaves a half-made create for the next load to find, and its ref is not reused", async () => {
    const { sample, project, loaded, deps } = await setup();
    project.faults.failWrite.add(PROJECT);
    await perform(deps(), loaded, (state) =>
      createExperiment(
        state,
        { questionId: sample.first, title: "Three" },
        sample.env,
      ),
    );
    project.faults.failWrite.clear();
    const reloaded = await loadNotebook(project.read, FOLDER);
    if (!reloaded.ok) throw new Error(reloaded.reason);
    expect(reloaded.value.state.experiments.map((e) => e.folder)).toContain(
      "EXP-003",
    );
    const next = await perform(deps(), reloaded.value, (state) =>
      createExperiment(
        state,
        { questionId: sample.first, title: "Four" },
        sample.env,
      ),
    );
    if (next.kind !== "done") throw new Error(next.kind);
    expect(next.loaded.state.experiments.map((e) => e.folder)).toContain(
      "EXP-004",
    );
  });
});

describe("perform: the application's own writes are not outside changes", () => {
  function echoOf(
    changes: ReturnType<typeof fakeChanges>,
    path: string,
    text: string,
  ) {
    const held = changes.held[path];
    if (held === undefined) throw new Error(`${path} is not held`);
    return external(held, { kind: "present", sha256: sha256Hex(text) });
  }

  it("recognises the echo of a save, and holds the new hash as the base", async () => {
    const { sample, project, changes, loaded, deps } = await setup();
    const done = await perform(deps(), loaded, (state) =>
      editExperiment(state, sample.one, { title: "Renamed" }, sample.env),
    );
    if (done.kind !== "done") throw new Error(done.kind);
    const text = project.disk[EXP_1] ?? "";
    expect(changes.held[EXP_1]?.base).toBe(sha256Hex(text));
    expect(changes.held[EXP_1]?.unsaved).toBeNull();
    expect(echoOf(changes, EXP_1, text).effects).toEqual([]);
  });

  it("holds a new file as soon as it is written, so an outside edit to it is seen", async () => {
    const { sample, project, changes, loaded, deps } = await setup();
    await perform(deps(), loaded, (state) =>
      createQuestion(state, { title: "Third" }, sample.env),
    );
    const path = "_notebook/questions/Q-003.md";
    expect(changes.held[path]?.base).toBe(sha256Hex(project.disk[path] ?? ""));
    expect(echoOf(changes, path, "edited by someone else\n").effects).toEqual([
      { kind: "reload", path },
    ]);
  });

  it("stops holding what it moved to the trash", async () => {
    const { sample, changes, loaded, deps } = await setup();
    await perform(deps(), loaded, (state) =>
      removeExperiment(state, sample.one, sample.env),
    );
    expect(changes.held).not.toHaveProperty(EXP_1);
    expect(changes.held).toHaveProperty(
      "_notebook/experiments/EXP-002/experiment.md",
    );
  });

  it("does not keep an unsaved copy of a write that failed", async () => {
    const { sample, project, changes, loaded, deps } = await setup();
    project.faults.failWrite.add(EXP_1);
    await perform(deps(), loaded, (state) =>
      editExperiment(state, sample.one, { title: "Renamed" }, sample.env),
    );
    expect(changes.held[EXP_1]?.unsaved).toBeNull();
    expect(changes.held[EXP_1]?.saving).toEqual([]);
  });
});
