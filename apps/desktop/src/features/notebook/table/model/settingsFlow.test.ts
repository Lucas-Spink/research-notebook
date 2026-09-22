import {
  changeTableSettings,
  parseProject,
  type TableSettingsChange,
} from "@research-notebook/format";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFirstWriteGuard } from "../../../history";
import {
  FOLDER,
  fakeChanges,
  fakeProject,
  filesOf,
  sampleNotebook,
} from "../../model/fakeApi";
import { loadNotebook } from "../../model/load";
import { perform } from "../../model/perform";
import type { Loaded } from "../../model/api";
import { createSettingsCommitter } from "./settingsCommit";

/**
 * Saving the table's layout end to end: the committer's writes go through the
 * same safe path as every other change to the notebook (ADR-0025, ADR-0026).
 */

const PROJECT = "_notebook/project.yaml";
const DELAY = 1000;

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function setup(
  options: { writable?: boolean; lastWrittenBy?: string } = {},
) {
  const sample = sampleNotebook();
  const project = fakeProject(filesOf(sample.state));
  const changes = fakeChanges();
  const first = await loadNotebook(project.read, FOLDER);
  if (!first.ok) throw new Error(first.reason);
  for (const [path, base] of Object.entries(first.value.hashes)) {
    changes.track(path, base);
  }
  let loaded: Loaded = first.value;
  const guard = createFirstWriteGuard(
    project.write,
    FOLDER,
    options.lastWrittenBy ?? "0.2.0",
    "0.2.0",
  );
  const unsaved: TableSettingsChange[] = [];
  const committer = createSettingsCommitter({
    delayMs: DELAY,
    onUnsaved: (change) => unsaved.push(change),
    commit: async (change) => {
      const done = await perform(
        {
          api: project.write,
          folder: FOLDER,
          guard,
          changes,
          writable: options.writable ?? true,
        },
        loaded,
        (state) => changeTableSettings(state, change, sample.env),
      );
      if (done.kind === "done") loaded = done.loaded;
      return done.kind === "done";
    },
  });
  const onDisk = () => {
    const parsed = parseProject(project.disk[PROJECT] ?? "");
    if (!parsed.ok) throw new Error("project.yaml does not parse");
    return parsed.value;
  };
  const projectWrites = () =>
    project.calls.filter((c) => c === `write ${PROJECT}`).length;
  return {
    sample,
    project,
    changes,
    committer,
    onDisk,
    projectWrites,
    unsaved,
    loaded: () => loaded,
  };
}

describe("saving the table's layout", () => {
  it("makes a burst of resizes, hides and collapses one write of project.yaml", async () => {
    const { sample, committer, onDisk, projectWrites } = await setup();
    committer.change({ widths: { methods: 300 } });
    committer.change({ hidden: { literature: true } });
    committer.change({ collapsed: { [sample.first]: true } });
    committer.change({ widths: { methods: 340 } });
    await vi.advanceTimersByTimeAsync(DELAY);
    await vi.advanceTimersByTimeAsync(0);
    expect(projectWrites()).toBe(1);
    const saved = onDisk();
    expect(saved.table.columns.find((c) => c.key === "methods")?.width).toBe(
      340,
    );
    expect(
      saved.table.columns.find((c) => c.key === "literature")?.hidden,
    ).toBe(true);
    expect(saved.table.collapsed_questions).toEqual([sample.first]);
  });

  it("changes nothing else in project.yaml", async () => {
    const { sample, committer, onDisk } = await setup();
    const before = onDisk();
    committer.change(
      { collapsed: { [sample.first]: true } },
      { immediate: true },
    );
    await vi.advanceTimersByTimeAsync(0);
    const after = onDisk();
    expect(after.order).toEqual(before.order);
    expect(after.numbering).toEqual(before.numbering);
    expect(after.table.columns).toEqual(before.table.columns);
  });

  it("does not take its own save for an outside change, and saves again from the new hash", async () => {
    const { sample, changes, committer, projectWrites, onDisk } = await setup();
    committer.change(
      { collapsed: { [sample.first]: true } },
      { immediate: true },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(changes.held[PROJECT]?.unsaved).toBeNull();
    expect(changes.held[PROJECT]?.saving).toEqual([]);
    committer.change(
      { collapsed: { [sample.first]: false } },
      { immediate: true },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(projectWrites()).toBe(2);
    expect(onDisk().table.collapsed_questions).toEqual([]);
  });

  it("does not overwrite project.yaml if it was changed outside meanwhile, and stops showing the change", async () => {
    const { sample, project, committer, unsaved, projectWrites } =
      await setup();
    project.disk[PROJECT] =
      `${project.disk[PROJECT] ?? ""}# edited elsewhere\n`;
    committer.change(
      { collapsed: { [sample.first]: true } },
      { immediate: true },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(project.disk[PROJECT]).toContain("edited elsewhere");
    expect(projectWrites()).toBe(1);
    expect(unsaved.at(-1)).toEqual({});
  });

  it("makes the version-change backup before the first save by a new version", async () => {
    const { sample, project, committer } = await setup({
      lastWrittenBy: "0.1.0",
    });
    project.calls.length = 0;
    committer.change(
      { collapsed: { [sample.first]: true } },
      { immediate: true },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(project.calls[0]).toBe("backup");
  });

  it("writes nothing in a read-only project, and the change is kept for the session", async () => {
    const { sample, project, committer, unsaved } = await setup({
      writable: false,
    });
    project.calls.length = 0;
    committer.change(
      { collapsed: { [sample.first]: true } },
      { persist: false },
    );
    await vi.advanceTimersByTimeAsync(DELAY * 3);
    expect(project.calls).toEqual([]);
    expect(unsaved.at(-1)).toEqual({ collapsed: { [sample.first]: true } });
  });

  it("saves nothing when the layout is already what was asked for", async () => {
    const { committer, project } = await setup();
    project.calls.length = 0;
    committer.change(
      { widths: { methods: 260 }, hidden: { methods: false } },
      { immediate: true },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(project.calls.filter((c) => c.startsWith("write "))).toEqual([]);
  });
});
