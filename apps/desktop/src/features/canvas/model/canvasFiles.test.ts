import { parseCanvas, serialiseCanvas } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { canvasFileName, canvasPathOfFile, newCanvasFile } from "./canvasFiles";

const QUESTION = "01JAXQ0000000000000000000A";

describe("canvasFileName", () => {
  it("names a question's canvas by the question's own id (ADR-0065)", () => {
    expect(canvasFileName(QUESTION)).toBe(`${QUESTION}.canvas.json`);
  });
});

describe("canvasPathOfFile", () => {
  it("puts a canvas file under _notebook/canvases", () => {
    expect(canvasPathOfFile(canvasFileName(QUESTION))).toBe(
      `_notebook/canvases/${QUESTION}.canvas.json`,
    );
  });
});

describe("newCanvasFile", () => {
  it("is an empty canvas that packages/format accepts and writes back unchanged", () => {
    const file = newCanvasFile(QUESTION, "Q-001 First");
    const text = serialiseCanvas(file);
    const parsed = parseCanvas(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(serialiseCanvas(parsed.value)).toBe(text);
    expect(file).toMatchObject({
      format_version: 2,
      id: QUESTION,
      name: "Q-001 First",
      nodes: [],
      edges: [],
      viewport: { x: 0, y: 0, zoom: 1 },
    });
  });
});
