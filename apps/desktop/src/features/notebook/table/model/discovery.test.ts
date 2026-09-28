import { describe, expect, it } from "vitest";
import type { DiscoveredFileDto } from "../../../../ipc/bindings";
import {
  defaultSelection,
  discoveredKey,
  discoveredToChosenFiles,
  patternsToText,
  textToPatterns,
} from "./discovery";

/** FR-EVD-09: editing globs as text, and turning a scan's results into
 * selectable files and, once chosen, into locations `addEvidenceFiles` takes. */

const file = (
  path: string,
  captured: boolean,
  size: number | null = 10,
): DiscoveredFileDto => ({
  location: { root: "project", path },
  name: path.slice(path.lastIndexOf("/") + 1),
  size,
  modified: "2026-09-28T10:00:00Z",
  captured,
});

describe("patternsToText and textToPatterns", () => {
  it("round-trip a list of patterns as one per line", () => {
    const patterns = ["*.csv", "node_modules"];
    expect(textToPatterns(patternsToText(patterns))).toEqual(patterns);
  });

  it("drops blank lines and surrounding whitespace", () => {
    expect(textToPatterns("*.csv\n\n  node_modules  \n")).toEqual([
      "*.csv",
      "node_modules",
    ]);
  });

  it("is empty for empty or whitespace-only text", () => {
    expect(textToPatterns("")).toEqual([]);
    expect(textToPatterns("   \n\n")).toEqual([]);
  });
});

describe("discoveredKey", () => {
  it("is the same for two files at the same location", () => {
    const a = file("results/pca.csv", false);
    const b = file("results/pca.csv", true);
    expect(discoveredKey(a)).toBe(discoveredKey(b));
  });

  it("differs by root or by path", () => {
    const project = file("a.csv", false);
    const external = {
      ...project,
      location: { ...project.location, root: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC" },
    };
    const other = file("b.csv", false);
    expect(discoveredKey(project)).not.toBe(discoveredKey(external));
    expect(discoveredKey(project)).not.toBe(discoveredKey(other));
  });
});

describe("defaultSelection", () => {
  it("selects every file not already captured", () => {
    const a = file("a.csv", false);
    const b = file("b.csv", true);
    const c = file("c.csv", false);
    const selected = defaultSelection([a, b, c]);
    expect(selected.has(discoveredKey(a))).toBe(true);
    expect(selected.has(discoveredKey(b))).toBe(false);
    expect(selected.has(discoveredKey(c))).toBe(true);
  });
});

describe("discoveredToChosenFiles", () => {
  it("keeps only the selected files, as located choices", () => {
    const a = file("a.csv", false, 5);
    const b = file("b.csv", false, 7);
    const selected = new Set([discoveredKey(b)]);

    const chosen = discoveredToChosenFiles([a, b], selected);

    expect(chosen).toEqual([
      { kind: "located", name: "b.csv", size: 7, location: b.location },
    ]);
  });

  it("treats a missing size as zero, so nothing is left undefined", () => {
    const a = file("a.csv", false, null);
    const chosen = discoveredToChosenFiles([a], new Set([discoveredKey(a)]));
    expect(chosen[0]).toMatchObject({ size: 0 });
  });
});
