import { parseCanvas, serialiseCanvas } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import {
  canvasName,
  canvasPath,
  defaultCanvasName,
  newCanvasFile,
  renamed,
  sortEntries,
} from "./canvasFiles";

const ID = "01JAXC0000000000000000CNV1";

describe("canvasPath", () => {
  it("puts a canvas under _notebook/canvases, named by its id", () => {
    expect(canvasPath(ID)).toBe(`_notebook/canvases/${ID}.canvas.json`);
  });
});

describe("newCanvasFile", () => {
  it("is an empty canvas that packages/format accepts and writes back unchanged", () => {
    const file = newCanvasFile(ID, "Figure 2");
    const text = serialiseCanvas(file);
    const parsed = parseCanvas(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(serialiseCanvas(parsed.value)).toBe(text);
    expect(file).toMatchObject({
      format_version: 2,
      id: ID,
      name: "Figure 2",
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  });
});

describe("canvasName", () => {
  it("trims the name", () => {
    expect(canvasName("  Figure 2  ")).toEqual({ ok: true, value: "Figure 2" });
  });

  it.each([
    ["nothing", "", "empty"],
    ["only spaces", "   ", "empty"],
    ["a line break", "two\nlines", "unsuitable"],
    ["a tab", "a\tb", "unsuitable"],
    ["a control character", "a\u0007b", "unsuitable"],
    ["a line separator", "a b", "unsuitable"],
  ])("refuses %s", (_label, raw, error) => {
    expect(canvasName(raw)).toEqual({ ok: false, error });
  });

  it("keeps text from any script", () => {
    expect(canvasName("図 2 – résumé")).toEqual({
      ok: true,
      value: "図 2 – résumé",
    });
  });
});

describe("defaultCanvasName", () => {
  it("is Untitled canvas when there is none", () => {
    expect(defaultCanvasName([])).toBe("Untitled canvas");
  });

  it("counts up past the names already used, ignoring case", () => {
    expect(
      defaultCanvasName(["Untitled canvas", "untitled canvas 2", "Other"]),
    ).toBe("Untitled canvas 3");
  });

  it("reuses a free number", () => {
    expect(defaultCanvasName(["Untitled canvas", "Untitled canvas 3"])).toBe(
      "Untitled canvas 2",
    );
  });
});

describe("renamed", () => {
  it("changes only the name and leaves the input alone", () => {
    const file = newCanvasFile(ID, "Old");
    const next = renamed(file, "New");
    expect(next).toEqual({ ...file, name: "New" });
    expect(file.name).toBe("Old");
  });
});

describe("sortEntries", () => {
  const entry = (fileName: string, name: string | null) => ({ fileName, name });

  it("orders by name, ignoring case, then by file name", () => {
    const sorted = sortEntries([
      entry("c.canvas.json", "beta"),
      entry("b.canvas.json", "Alpha"),
      entry("a.canvas.json", "alpha"),
    ]);
    expect(sorted.map((e) => e.fileName)).toEqual([
      "a.canvas.json",
      "b.canvas.json",
      "c.canvas.json",
    ]);
  });

  it("puts a canvas that could not be read, shown by its file name, among the rest", () => {
    const sorted = sortEntries([
      entry("zzz.canvas.json", null),
      entry("a.canvas.json", "Mid"),
    ]);
    expect(sorted.map((e) => e.fileName)).toEqual([
      "a.canvas.json",
      "zzz.canvas.json",
    ]);
  });

  it("does not change its input", () => {
    const input = [entry("b", "b"), entry("a", "a")];
    sortEntries(input);
    expect(input.map((e) => e.fileName)).toEqual(["b", "a"]);
  });
});
