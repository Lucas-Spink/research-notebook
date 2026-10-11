import { parseCanvas } from "@research-notebook/format";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { A, B, FOLDER, fakeApi, pathOf, textOf } from "./fakeApi";
import { moveNode, pinResults } from "./nodes";
import { createCanvasSaver, type SaveReport } from "./saver";
import { loadCanvases, type CanvasEntry } from "./store";

/**
 * Edits to a canvas are saved after a short quiet, as one write however many
 * edits came in, in order, and never over a file someone else changed.
 */

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const DELAY = 800;

async function setup(
  files: Record<string, string>,
  faults?: Parameters<typeof fakeApi>[1],
) {
  const fake = fakeApi(files, faults);
  const loaded = await loadCanvases(fake.api, FOLDER);
  if (!loaded.ok) throw new Error("load failed");
  const reports: SaveReport[] = [];
  const saver = createCanvasSaver({
    api: fake.api,
    folder: FOLDER,
    delayMs: DELAY,
    onReport: (report) => reports.push(report),
  });
  const entry = (id: string): CanvasEntry => {
    const found = loaded.value.find((e) => e.fileName === `${id}.canvas.json`);
    if (found === undefined) throw new Error("no entry");
    return found;
  };
  return { ...fake, saver, reports, entry };
}

const file = (entry: CanvasEntry) => {
  if (entry.file === null) throw new Error("canvas did not parse");
  return entry.file;
};

const pin = (file: NonNullable<CanvasEntry["file"]>, n: number) =>
  pinResults(
    file,
    [
      {
        experimentId: "01JAXE000000000000000000A1",
        artefactId: "01JAXA000000000000000000A1",
        version: 1,
      },
    ],
    { x: n, y: n },
    () => `01JAXN${String(n).padStart(20, "0")}`,
  );

describe("the canvas saver", () => {
  it("writes nothing until the edits have been quiet for the delay", async () => {
    const { saver, entry, writes } = await setup({
      [pathOf(A)]: textOf(A, "One"),
    });
    const e = entry(A);
    saver.queue(e, pin(file(e), 1));
    await vi.advanceTimersByTimeAsync(DELAY - 1);
    expect(writes).toEqual([]);
    await vi.advanceTimersByTimeAsync(2);
    expect(writes).toEqual([pathOf(A)]);
  });

  it("makes one write for a burst of edits, holding the last", async () => {
    const { saver, entry, writes, disk } = await setup({
      [pathOf(A)]: textOf(A, "One"),
    });
    const e = entry(A);
    const first = pin(file(e), 1);
    const second = pin(first, 2);
    saver.queue(e, first);
    await vi.advanceTimersByTimeAsync(300);
    saver.queue(e, second);
    await vi.advanceTimersByTimeAsync(DELAY + 1);
    expect(writes).toEqual([pathOf(A)]);
    const saved = parseCanvas(disk[pathOf(A)] ?? "");
    expect(saved.ok && saved.value.nodes).toHaveLength(2);
  });

  it("reports the entry it saved, with the hash the next save will expect", async () => {
    const { saver, entry, reports } = await setup({
      [pathOf(A)]: textOf(A, "One"),
    });
    const e = entry(A);
    saver.queue(e, pin(file(e), 1));
    await vi.advanceTimersByTimeAsync(DELAY + 1);
    const [report] = reports;
    expect(report?.ok).toBe(true);
    if (report?.ok) expect(report.entry.sha256).not.toBe(e.sha256);
  });

  it("saves a later edit over the earlier save, without the person reloading", async () => {
    const { saver, entry, writes, disk } = await setup({
      [pathOf(A)]: textOf(A, "One"),
    });
    const e = entry(A);
    const first = pin(file(e), 1);
    saver.queue(e, first);
    await vi.advanceTimersByTimeAsync(DELAY + 1);
    saver.queue(e, pin(first, 2));
    await vi.advanceTimersByTimeAsync(DELAY + 1);
    expect(writes).toEqual([pathOf(A), pathOf(A)]);
    const saved = parseCanvas(disk[pathOf(A)] ?? "");
    expect(saved.ok && saved.value.nodes).toHaveLength(2);
  });

  it("flush saves at once and resolves when it is done", async () => {
    const { saver, entry, writes } = await setup({
      [pathOf(A)]: textOf(A, "One"),
    });
    const e = entry(A);
    saver.queue(e, pin(file(e), 1));
    await saver.flush();
    expect(writes).toEqual([pathOf(A)]);
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(writes).toEqual([pathOf(A)]);
  });

  it("keeps different canvases apart", async () => {
    const { saver, entry, writes } = await setup({
      [pathOf(A)]: textOf(A, "One"),
      [pathOf(B)]: textOf(B, "Two"),
    });
    saver.queue(entry(A), pin(file(entry(A)), 1));
    saver.queue(entry(B), pin(file(entry(B)), 2));
    await saver.flush();
    expect([...writes].sort()).toEqual([pathOf(A), pathOf(B)]);
  });

  it("never overwrites a file changed outside, reports it and forgets the edit", async () => {
    const { saver, entry, disk, reports } = await setup({
      [pathOf(A)]: textOf(A, "One"),
    });
    const e = entry(A);
    disk[pathOf(A)] = textOf(A, "Edited elsewhere");
    saver.queue(e, pin(file(e), 1));
    await saver.flush();
    expect(disk[pathOf(A)]).toBe(textOf(A, "Edited elsewhere"));
    expect(reports).toEqual([
      { fileName: `${A}.canvas.json`, ok: false, error: "changed" },
    ]);
    // Nothing is retried behind the person's back.
    await vi.advanceTimersByTimeAsync(DELAY * 5);
    expect(reports).toHaveLength(1);
  });

  it("reports a failed write and tries again with the next edit, not by itself", async () => {
    const { saver, entry, reports, writes } = await setup(
      { [pathOf(A)]: textOf(A, "One") },
      { write: "error" },
    );
    const e = entry(A);
    saver.queue(e, pin(file(e), 1));
    await saver.flush();
    expect(reports).toEqual([
      { fileName: `${A}.canvas.json`, ok: false, error: "writeFailed" },
    ]);
    await vi.advanceTimersByTimeAsync(DELAY * 5);
    expect(writes).toHaveLength(1);
  });

  it("discard drops what is waiting for a file", async () => {
    const { saver, entry, writes } = await setup({
      [pathOf(A)]: textOf(A, "One"),
    });
    const e = entry(A);
    saver.queue(e, pin(file(e), 1));
    saver.discard(e.fileName);
    await saver.flush();
    await vi.advanceTimersByTimeAsync(DELAY * 2);
    expect(writes).toEqual([]);
  });

  it("an edit that arrives while a save is running is saved after it, in order", async () => {
    const { saver, entry, writes, disk } = await setup({
      [pathOf(A)]: textOf(A, "One"),
    });
    const e = entry(A);
    const first = pin(file(e), 1);
    saver.queue(e, first);
    const done = saver.flush();
    saver.queue(e, moveNode(first, first.nodes[0]?.id ?? "", { x: 50, y: 50 }));
    await done;
    await saver.flush();
    expect(writes.length).toBeGreaterThanOrEqual(1);
    const saved = parseCanvas(disk[pathOf(A)] ?? "");
    expect(saved.ok && saved.value.nodes[0]?.position).toEqual({
      x: 50,
      y: 50,
    });
  });
});
