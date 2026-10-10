import { describe, expect, it } from "vitest";
import { artefactDetails, formatSize } from "./details";
import { ids, sampleArtefacts } from "./sample";

describe("artefactDetails", () => {
  it("reads type, size, date and every group of a captured result", () => {
    const file = sampleArtefacts();
    const target = file.artefacts.find((a) => a.id === ids.r(2));
    if (target === undefined) throw new Error("sample");
    target.classification = "supplementary_figure";
    expect(artefactDetails(file, ids.r(2))).toEqual({
      name: "Heatmap",
      type: "image",
      mode: "copy",
      classification: "supplementary_figure",
      size: 10,
      added: "2026-09-01",
      sourcePath: "out/Heatmap.png",
      folders: ["Figures", "Figures / Supplementary"],
    });
  });

  it("has no folders for an ungrouped result and none at all for an unknown id", () => {
    expect(artefactDetails(sampleArtefacts(), ids.r(4))?.folders).toEqual([]);
    expect(artefactDetails(sampleArtefacts(), "missing")).toBeNull();
  });
});

describe("formatSize", () => {
  it("scales to the nearest unit", () => {
    expect(formatSize(512)).toBe("512 B");
    expect(formatSize(1536)).toBe("1.5 KB");
    expect(formatSize(3 * 1024 * 1024)).toBe("3.0 MB");
  });
});
