import { describe, expect, it } from "vitest";
import {
  reloadsNotebook,
  touchesBibliography,
  touchesCanvases,
} from "./changes";

const only = (...paths: string[]) => ({ paths, needsRescan: false });

describe("reloadsNotebook", () => {
  it.each([
    "_notebook/project.yaml",
    "_notebook/questions/Q1.md",
    "_notebook/experiments/EXP-001/experiment.md",
    "_notebook/experiments/EXP-001/artefacts.yaml",
  ])("is true for %s, which the canvas cards are drawn from", (path) => {
    expect(reloadsNotebook(only(path))).toBe(true);
  });

  it("is false when only canvas files changed, which include the window's own saves", () => {
    expect(
      reloadsNotebook(
        only("_notebook/canvases/01JAXQ0000000000000000000A.canvas.json"),
      ),
    ).toBe(false);
  });

  it("is true when events may have been lost", () => {
    expect(reloadsNotebook({ paths: [], needsRescan: true })).toBe(true);
  });

  it("is true when any one of several files matters", () => {
    expect(
      reloadsNotebook(
        only(
          "_notebook/canvases/01JAXQ0000000000000000000A.canvas.json",
          "_notebook/questions/Q1.md",
        ),
      ),
    ).toBe(true);
  });

  it("is false for nothing", () => {
    expect(reloadsNotebook(only())).toBe(false);
  });
});

describe("touchesBibliography", () => {
  it("is true for the cached sources", () => {
    expect(touchesBibliography(only("_notebook/bibliography.json"))).toBe(true);
  });

  it("is true when events may have been lost", () => {
    expect(touchesBibliography({ paths: [], needsRescan: true })).toBe(true);
  });

  it("is false for other files", () => {
    expect(touchesBibliography(only("_notebook/questions/Q1.md"))).toBe(false);
  });
});

describe("touchesCanvases", () => {
  it("is true for a canvas file", () => {
    expect(
      touchesCanvases(
        only("_notebook/canvases/01JAXQ0000000000000000000A.canvas.json"),
      ),
    ).toBe(true);
  });

  it("is true when events may have been lost", () => {
    expect(touchesCanvases({ paths: [], needsRescan: true })).toBe(true);
  });

  it("is false for question and experiment files", () => {
    expect(touchesCanvases(only("_notebook/questions/Q1.md"))).toBe(false);
  });
});
