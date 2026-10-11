import { parseCanvas } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../../shared/sha256";
import { newCanvasFile } from "./canvasFiles";
import { A, B, FOLDER, fakeApi, fileOf, pathOf, textOf } from "./fakeApi";
import { addNote } from "./notes";
import { canvasEntryOf, loadCanvases, saveCanvas } from "./store";

/**
 * ADR-0065: a question's canvas is a plain file named by the question's id,
 * made on its first change. A save never overwrites an outside edit and a file
 * that does not parse is never rewritten.
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

  it("reads each canvas, with the hash of the bytes read", async () => {
    const { api } = fakeApi({
      [pathOf(B)]: textOf(B, "Two"),
      [pathOf(A)]: textOf(A, "One"),
    });
    const entries = must(await loadCanvases(api, FOLDER));
    expect(entries.map((e) => e.fileName)).toEqual([fileOf(A), fileOf(B)]);
    expect(entries[0]?.file?.id).toBe(A);
    expect(entries[0]?.sha256).toBe(sha256Hex(textOf(A, "One")));
  });

  it("keeps a canvas that does not parse, without a file, so it is left alone", async () => {
    const { api, disk } = fakeApi({
      [pathOf(A)]: textOf(A, "Fine"),
      [pathOf(B)]: "{ not json",
    });
    const entries = must(await loadCanvases(api, FOLDER));
    const broken = entries.find((e) => e.fileName === fileOf(B));
    expect(broken).toMatchObject({ name: null, file: null });
    expect(disk[pathOf(B)]).toBe("{ not json");
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
    const { api, writes } = fakeApi({ [pathOf(A)]: "{ not json" });
    await loadCanvases(api, FOLDER);
    expect(writes).toEqual([]);
  });
});

describe("canvasEntryOf", () => {
  it("is the question's own canvas when it has one", async () => {
    const { api } = fakeApi({ [pathOf(A)]: textOf(A, "One") });
    const entries = must(await loadCanvases(api, FOLDER));
    const entry = canvasEntryOf(entries, { id: A, name: "Q-001 First" });
    expect(entry.file?.name).toBe("One");
    expect(entry.sha256).toBe(sha256Hex(textOf(A, "One")));
  });

  it("is an empty canvas not yet on disk when it has none, named for the question", () => {
    const entry = canvasEntryOf([], { id: A, name: "Q-001 First" });
    expect(entry).toMatchObject({
      fileName: fileOf(A),
      path: pathOf(A),
      sha256: null,
      name: "Q-001 First",
    });
    expect(entry.file).toEqual(newCanvasFile(A, "Q-001 First"));
  });

  it("does not take another question's canvas", async () => {
    const { api } = fakeApi({ [pathOf(B)]: textOf(B, "Two") });
    const entries = must(await loadCanvases(api, FOLDER));
    expect(canvasEntryOf(entries, { id: A, name: "Q" }).sha256).toBeNull();
  });

  it("returns a canvas that did not parse as it is, with no file to change", async () => {
    const { api } = fakeApi({ [pathOf(A)]: "{ not json" });
    const entries = must(await loadCanvases(api, FOLDER));
    expect(canvasEntryOf(entries, { id: A, name: "Q" }).file).toBeNull();
  });
});

describe("saveCanvas", () => {
  const withNote = (id: string) =>
    addNote(
      newCanvasFile(id, "Q"),
      { x: 0, y: 0 },
      () => "01JAXN00000000000000000001",
    );

  it("makes the file the first time, as a file that must not exist yet", async () => {
    const { api, disk } = fakeApi({});
    const entry = canvasEntryOf([], { id: A, name: "Q" });
    const saved = must(await saveCanvas(api, FOLDER, entry, withNote(A)));
    expect(parseCanvas(disk[pathOf(A)] ?? "").ok).toBe(true);
    expect(saved.sha256).toBe(sha256Hex(disk[pathOf(A)] ?? ""));
  });

  it("does not replace a canvas that appeared in the meantime", async () => {
    const { api, disk } = fakeApi({ [pathOf(A)]: textOf(A, "Someone else's") });
    const entry = canvasEntryOf([], { id: A, name: "Q" });
    expect(await saveCanvas(api, FOLDER, entry, withNote(A))).toEqual({
      ok: false,
      error: "changed",
    });
    expect(disk[pathOf(A)]).toBe(textOf(A, "Someone else's"));
  });

  it("saves over the file it read, expecting it unchanged", async () => {
    const { api, disk } = fakeApi({ [pathOf(A)]: textOf(A, "One") });
    const [entry] = must(await loadCanvases(api, FOLDER));
    if (entry === undefined) throw new Error("missing");
    must(await saveCanvas(api, FOLDER, entry, withNote(A)));
    expect(parseCanvas(disk[pathOf(A)] ?? "").ok).toBe(true);
  });

  it("does not overwrite an edit made outside the application", async () => {
    const { api, disk } = fakeApi({ [pathOf(A)]: textOf(A, "One") });
    const [entry] = must(await loadCanvases(api, FOLDER));
    if (entry === undefined) throw new Error("missing");
    disk[pathOf(A)] = textOf(A, "Edited elsewhere");
    expect(await saveCanvas(api, FOLDER, entry, withNote(A))).toEqual({
      ok: false,
      error: "changed",
    });
    expect(disk[pathOf(A)]).toBe(textOf(A, "Edited elsewhere"));
  });

  it("never rewrites a canvas that did not parse", async () => {
    const { api, disk } = fakeApi({ [pathOf(A)]: "{ not json" });
    const [entry] = must(await loadCanvases(api, FOLDER));
    if (entry === undefined) throw new Error("missing");
    expect(await saveCanvas(api, FOLDER, entry, withNote(A))).toEqual({
      ok: false,
      error: "invalid",
    });
    expect(disk[pathOf(A)]).toBe("{ not json");
  });

  it("reports a project that is read-only, and any other failure to write", async () => {
    const entry = canvasEntryOf([], { id: A, name: "Q" });
    expect(
      await saveCanvas(
        fakeApi({}, { writable: false }).api,
        FOLDER,
        entry,
        withNote(A),
      ),
    ).toEqual({ ok: false, error: "notWritable" });
    expect(
      await saveCanvas(
        fakeApi({}, { write: "error" }).api,
        FOLDER,
        entry,
        withNote(A),
      ),
    ).toEqual({ ok: false, error: "writeFailed" });
  });
});
