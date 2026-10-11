import { describe, expect, it, vi } from "vitest";
import type { BinItem } from "../../../../ipc/bindings";
import { restoreEntry } from "./restoreEntry";

const question: BinItem = {
  stamp: "2026-09-21T10-15-00Z",
  kind: "question",
  name: "Q-001.md",
  original: "_notebook/questions/Q-001.md",
  note: null,
};
const experiment: BinItem = {
  ...question,
  kind: "experiment",
  name: "EXP-001",
};
const files: BinItem = { ...question, kind: "files", name: "EXP-001" };

function setup(
  options: {
    restore?: "ok" | "nameTaken" | "notWritable";
    record?: string;
    binned?: BinItem[];
  } = {},
) {
  const restoreFromBin = vi.fn(() =>
    Promise.resolve(
      options.restore === undefined || options.restore === "ok"
        ? { status: "ok" as const, data: null }
        : { status: "error" as const, error: { kind: options.restore } },
    ),
  );
  const readBinnedRecord = vi.fn(() =>
    Promise.resolve({ status: "ok" as const, data: options.record ?? "" }),
  );
  const listBin = vi.fn(() =>
    Promise.resolve({ status: "ok" as const, data: options.binned ?? [] }),
  );
  const refresh = vi.fn(() => Promise.resolve());
  const adoptRestored = vi.fn((...args: [unknown]) => {
    void args;
    return Promise.resolve(true);
  });
  const editArtefacts = vi.fn((...args: [string, unknown]) => {
    void args;
    return Promise.resolve({ ok: true as const });
  });
  return {
    request: {
      api: {
        restoreFromBin,
        readBinnedRecord,
        binArtefactFiles: vi.fn(),
        listBin,
      },
      folder: 1,
      refresh,
      adoptRestored,
      editArtefacts,
    },
    restoreFromBin,
    readBinnedRecord,
    listBin,
    refresh,
    adoptRestored,
    editArtefacts,
  };
}

const noted = (index: number, experiments: string[] = []) =>
  JSON.stringify({ version: 1, index, experiments });

describe("restoring an entry from the bin", () => {
  it("puts a question back, then reloads the notebook so it appears", async () => {
    const s = setup();
    const result = await restoreEntry({ ...s.request, entry: question });
    expect(s.restoreFromBin).toHaveBeenCalledWith(
      1,
      question.stamp,
      "question",
      "Q-001.md",
    );
    expect(s.refresh).toHaveBeenCalledTimes(1);
    // It is listed in the saved order again once the notebook has reloaded.
    expect(s.adoptRestored).toHaveBeenCalledWith({ questionFile: "Q-001.md" });
    expect(result).toEqual({ ok: true, text: "Q-001 was restored." });
  });

  it("puts an experiment back and reloads", async () => {
    const s = setup();
    const result = await restoreEntry({ ...s.request, entry: experiment });
    expect(s.restoreFromBin).toHaveBeenCalledWith(
      1,
      experiment.stamp,
      "experiment",
      "EXP-001",
    );
    expect(s.adoptRestored).toHaveBeenCalledWith({
      experimentFolder: "EXP-001",
    });
    expect(result).toEqual({ ok: true, text: "EXP-001 was restored." });
  });

  it("hands the place it had to the saved order (ADR-0063)", async () => {
    const s = setup();
    await restoreEntry({
      ...s.request,
      entry: { ...question, note: noted(1) },
    });
    expect(s.adoptRestored).toHaveBeenCalledWith({
      questionFile: "Q-001.md",
      note: { index: 1, experiments: [] },
    });
  });

  it("ignores a note it cannot read", async () => {
    const s = setup();
    await restoreEntry({ ...s.request, entry: { ...question, note: "junk" } });
    expect(s.adoptRestored).toHaveBeenCalledWith({ questionFile: "Q-001.md" });
  });

  it("puts back the experiments binned with a question, newest first, before reloading", async () => {
    const older: BinItem = { ...experiment, stamp: "2026-09-20T09-00-00Z" };
    const s = setup({ binned: [older, experiment] });
    const result = await restoreEntry({
      ...s.request,
      entry: { ...question, note: noted(0, ["EXP-001"]) },
    });
    expect(s.restoreFromBin.mock.calls.map((c) => c.slice(1))).toEqual([
      [question.stamp, "question", "Q-001.md"],
      [experiment.stamp, "experiment", "EXP-001"],
    ]);
    expect(s.refresh).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ ok: true, text: "Q-001 was restored." });
  });

  it("says which experiments could not come back, and still restores the question", async () => {
    const s = setup({ binned: [] });
    const result = await restoreEntry({
      ...s.request,
      entry: { ...question, note: noted(0, ["EXP-001", "EXP-002"]) },
    });
    expect(result.ok).toBe(false);
    expect(result.text).toContain("EXP-001, EXP-002");
    expect(s.refresh).toHaveBeenCalledTimes(1);
    expect(s.adoptRestored).toHaveBeenCalledTimes(1);
  });

  it("says a name is in the way, and reloads nothing", async () => {
    const s = setup({ restore: "nameTaken" });
    const result = await restoreEntry({ ...s.request, entry: question });
    expect(result.ok).toBe(false);
    expect(result.text).toContain("already in the project");
    expect(s.refresh).not.toHaveBeenCalled();
    expect(s.adoptRestored).not.toHaveBeenCalled();
  });

  it("says when the project is read-only", async () => {
    const s = setup({ restore: "notWritable" });
    const result = await restoreEntry({ ...s.request, entry: experiment });
    expect(result.text).toContain("read-only");
  });

  it("restores removed files through the experiment's artefacts.yaml", async () => {
    const record = JSON.stringify({
      format_version: 2,
      artefacts: [
        {
          id: "01JB0000000000000000000001",
          name: "Volcano",
          role: "result",
          mode: "link",
          type: "image",
          source: { root: "project", path: "out/v.png" },
          created: "2026-09-01T09:00:00Z",
          link: {
            sha256: "c".repeat(64),
            size: 1,
            observed_mtime: "2026-09-01T09:00:00Z",
            checked: "2026-09-01T09:00:00Z",
          },
        },
      ],
      groups: [],
    });
    const s = setup({ record });
    const result = await restoreEntry({ ...s.request, entry: files });
    expect(result).toEqual({ ok: true, text: "Volcano was restored." });
    expect(s.editArtefacts).toHaveBeenCalledTimes(1);
    expect(s.editArtefacts.mock.calls[0]?.[0]).toBe("EXP-001");
  });

  it("explains a record that cannot be read, and moves nothing", async () => {
    const s = setup({ record: "not: [valid" });
    const result = await restoreEntry({ ...s.request, entry: files });
    expect(result.ok).toBe(false);
    expect(result.text).toContain("could not be read");
    expect(s.restoreFromBin).not.toHaveBeenCalled();
  });
});
