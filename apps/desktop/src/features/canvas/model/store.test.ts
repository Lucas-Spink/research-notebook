import { parseCanvas } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../../shared/sha256";
import { A, B, FOLDER, fakeApi, fileOf, pathOf, textOf } from "./fakeApi";
import {
  createCanvas,
  deleteCanvas,
  loadCanvases,
  renameCanvas,
  type CanvasApi,
  type CanvasEntry,
} from "./store";

/**
 * ADR-0064: canvases are plain files read and written through the existing
 * notebook commands. A save never overwrites an outside edit, a file that
 * does not parse is never rewritten, and deleting moves to the trash.
 */

function must<T>(
  result: { ok: true; value: T } | { ok: false; error: string },
): T {
  if (!result.ok) throw new Error(`expected success, got ${result.error}`);
  return result.value;
}

describe("loadCanvases", () => {
  it("is empty for a project without canvases", async () => {
    const { api } = fakeApi({});
    expect(must(await loadCanvases(api, FOLDER))).toEqual([]);
  });

  it("reads each canvas, ordered by name", async () => {
    const { api } = fakeApi({
      [pathOf(A)]: textOf(A, "Zebra"),
      [pathOf(B)]: textOf(B, "apple"),
    });
    const entries = must(await loadCanvases(api, FOLDER));
    expect(entries.map((e) => e.name)).toEqual(["apple", "Zebra"]);
    expect(entries[0]?.file?.id).toBe(B);
    expect(entries[0]?.sha256).toBe(sha256Hex(textOf(B, "apple")));
  });

  it("keeps a canvas that does not parse, without a name, so it can be seen and removed", async () => {
    const { api } = fakeApi({
      [pathOf(A)]: textOf(A, "Fine"),
      [pathOf(B)]: "{ not json",
    });
    const entries = must(await loadCanvases(api, FOLDER));
    const broken = entries.find((e) => e.fileName === fileOf(B));
    expect(broken).toMatchObject({ name: null, file: null });
    expect(entries.find((e) => e.fileName === fileOf(A))?.file).not.toBeNull();
  });

  it("treats a canvas from a newer format as one it cannot read", async () => {
    const newer = textOf(A, "Future").replace(
      '"format_version": 2',
      '"format_version": 3',
    );
    const { api } = fakeApi({ [pathOf(A)]: newer });
    const [entry] = must(await loadCanvases(api, FOLDER));
    expect(entry).toMatchObject({ name: null, file: null });
  });

  it("treats one file that cannot be read as unreadable, not the whole list", async () => {
    const { api } = fakeApi(
      { [pathOf(A)]: textOf(A, "Fine"), [pathOf(B)]: textOf(B, "Other") },
      { read: [pathOf(B)] },
    );
    const entries = must(await loadCanvases(api, FOLDER));
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.fileName === fileOf(B))?.file).toBeNull();
  });

  it("fails when the project's files cannot be listed", async () => {
    const { api } = fakeApi({}, { list: true });
    expect(await loadCanvases(api, FOLDER)).toEqual({
      ok: false,
      error: "unreadable",
    });
  });

  it("writes nothing", async () => {
    const { api, writes, trashed } = fakeApi({ [pathOf(A)]: "{ not json" });
    await loadCanvases(api, FOLDER);
    expect(writes).toEqual([]);
    expect(trashed).toEqual([]);
  });
});

describe("createCanvas", () => {
  it("writes a new empty canvas as a new file and returns it", async () => {
    const { api, disk } = fakeApi({});
    const entry = must(
      await createCanvas(api, FOLDER, { id: A, name: " Figure 2 " }),
    );
    expect(entry.name).toBe("Figure 2");
    expect(disk[pathOf(A)]).toBe(textOf(A, "Figure 2"));
    expect(entry.sha256).toBe(sha256Hex(textOf(A, "Figure 2")));
    expect(parseCanvas(disk[pathOf(A)] ?? "").ok).toBe(true);
  });

  it("refuses a name that cannot be used, writing nothing", async () => {
    const { api, writes } = fakeApi({});
    expect(await createCanvas(api, FOLDER, { id: A, name: "  " })).toEqual({
      ok: false,
      error: "invalidName",
    });
    expect(writes).toEqual([]);
  });

  it("never replaces a file that is already there", async () => {
    const { api, disk } = fakeApi({ [pathOf(A)]: "someone else's" });
    expect(await createCanvas(api, FOLDER, { id: A, name: "Mine" })).toEqual({
      ok: false,
      error: "exists",
    });
    expect(disk[pathOf(A)]).toBe("someone else's");
  });

  it("reports a project that is read-only", async () => {
    const { api } = fakeApi({}, { writable: false });
    expect(await createCanvas(api, FOLDER, { id: A, name: "X" })).toEqual({
      ok: false,
      error: "notWritable",
    });
  });

  it("reports any other failure to write", async () => {
    const { api } = fakeApi({}, { write: "error" });
    expect(await createCanvas(api, FOLDER, { id: A, name: "X" })).toEqual({
      ok: false,
      error: "writeFailed",
    });
  });
});

describe("renameCanvas", () => {
  async function loaded(text: string): Promise<{
    api: CanvasApi;
    disk: Record<string, string>;
    entry: CanvasEntry;
  }> {
    const fake = fakeApi({ [pathOf(A)]: text });
    const [entry] = must(await loadCanvases(fake.api, FOLDER));
    if (entry === undefined) throw new Error("no entry");
    return { api: fake.api, disk: fake.disk, entry };
  }

  it("changes only the name in the file and returns the new entry", async () => {
    const { api, disk, entry } = await loaded(textOf(A, "Old"));
    const next = must(await renameCanvas(api, FOLDER, entry, "New name"));
    expect(next.name).toBe("New name");
    expect(disk[pathOf(A)]).toBe(textOf(A, "New name"));
    expect(next.sha256).toBe(sha256Hex(textOf(A, "New name")));
  });

  it("keeps keys it does not know", async () => {
    const withUnknown = textOf(A, "Old").replace(
      '"viewport"',
      '"x_later": { "a": 1 },\n  "viewport"',
    );
    const { api, disk, entry } = await loaded(withUnknown);
    must(await renameCanvas(api, FOLDER, entry, "New"));
    expect(disk[pathOf(A)]).toContain('"x_later"');
  });

  it("refuses a name that cannot be used, writing nothing", async () => {
    const { api, disk, entry } = await loaded(textOf(A, "Old"));
    expect(await renameCanvas(api, FOLDER, entry, "")).toEqual({
      ok: false,
      error: "invalidName",
    });
    expect(disk[pathOf(A)]).toBe(textOf(A, "Old"));
  });

  it("never rewrites a canvas that did not parse", async () => {
    const { api, disk, entry } = await loaded("{ not json");
    expect(await renameCanvas(api, FOLDER, entry, "New")).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(disk[pathOf(A)]).toBe("{ not json");
  });

  it("does not overwrite an edit made outside the application", async () => {
    const { api, disk, entry } = await loaded(textOf(A, "Old"));
    disk[pathOf(A)] = textOf(A, "Edited elsewhere");
    expect(await renameCanvas(api, FOLDER, entry, "Mine")).toEqual({
      ok: false,
      error: "changed",
    });
    expect(disk[pathOf(A)]).toBe(textOf(A, "Edited elsewhere"));
  });
});

describe("deleteCanvas", () => {
  it("moves the file to the trash and nothing else", async () => {
    const { api, disk, trashed } = fakeApi({
      [pathOf(A)]: textOf(A, "One"),
      [pathOf(B)]: textOf(B, "Two"),
    });
    const entries = must(await loadCanvases(api, FOLDER));
    const one = entries.find((e) => e.fileName === fileOf(A));
    if (one === undefined) throw new Error("missing");
    expect(await deleteCanvas(api, FOLDER, one)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(trashed).toEqual([pathOf(A)]);
    expect(Object.keys(disk)).toEqual([pathOf(B)]);
  });

  it("can remove a canvas that did not parse", async () => {
    const { api, trashed } = fakeApi({ [pathOf(A)]: "{ not json" });
    const [entry] = must(await loadCanvases(api, FOLDER));
    if (entry === undefined) throw new Error("missing");
    expect((await deleteCanvas(api, FOLDER, entry)).ok).toBe(true);
    expect(trashed).toEqual([pathOf(A)]);
  });

  it("reports a failure to move it", async () => {
    const { api } = fakeApi(
      { [pathOf(A)]: textOf(A, "One") },
      { trash: "error" },
    );
    const [entry] = must(await loadCanvases(api, FOLDER));
    if (entry === undefined) throw new Error("missing");
    expect(await deleteCanvas(api, FOLDER, entry)).toEqual({
      ok: false,
      error: "writeFailed",
    });
  });
});
