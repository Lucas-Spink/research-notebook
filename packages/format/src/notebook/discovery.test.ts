import { describe, expect, it } from "vitest";
import type { ArtefactModel, ArtefactsFileModel } from "../schema";
import { capturedSourcePaths } from "../index";

const EXTERNAL_ROOT = "01JAXS0B1C2D3E4F5G6H7J8K9M";

function artefact(
  id: string,
  root: string,
  path: string,
  mode: "copy" | "link" = "copy",
): ArtefactModel {
  const common = {
    id,
    name: path,
    role: "result" as const,
    type: "other" as const,
    source: { root, path },
    created: "2026-09-01T09:00:00Z",
  };
  return mode === "copy"
    ? {
        ...common,
        mode,
        versions: [
          {
            v: 1,
            file: "evidence/x",
            sha256: "a".repeat(64),
            size: 1,
            captured: "2026-09-01T09:00:00Z",
          },
        ],
      }
    : {
        ...common,
        mode,
        link: {
          sha256: "b".repeat(64),
          size: 1,
          observed_mtime: "2026-09-01T09:00:00Z",
          checked: "2026-09-01T09:00:00Z",
        },
      };
}

function file(...artefacts: ArtefactModel[]): ArtefactsFileModel {
  return { format_version: 1, artefacts, groups: [] };
}

const EXP_A = file(
  artefact("01JAXR5D8K2M4N6P8Q0R2S4T6A", "project", "results/pca/pca.csv"),
  artefact("01JAXR5D8K2M4N6P8Q0R2S4T6B", "project", "results/umap.png", "link"),
  artefact("01JAXR5D8K2M4N6P8Q0R2S4T6C", "project", "scripts/run.R"),
);
const EXP_B = file(
  artefact(
    "01JAXR5D8K2M4N6P8Q0R2S4T6D",
    EXTERNAL_ROOT,
    "results/big.h5",
    "link",
  ),
  artefact("01JAXR5D8K2M4N6P8Q0R2S4T6E", "project", "results/pca/pca.csv"),
);

describe("capturedSourcePaths", () => {
  it("lists every source under the root when the folder is the root itself", () => {
    expect(capturedSourcePaths([EXP_A, EXP_B], "project", "")).toEqual([
      "results/pca/pca.csv",
      "results/umap.png",
      "scripts/run.R",
    ]);
  });

  it("returns paths relative to the chosen folder, copy and link alike", () => {
    expect(capturedSourcePaths([EXP_A], "project", "results")).toEqual([
      "pca/pca.csv",
      "umap.png",
    ]);
    expect(capturedSourcePaths([EXP_A], "project", "results/pca/")).toEqual([
      "pca.csv",
    ]);
  });

  it("only considers sources recorded against the same root", () => {
    expect(capturedSourcePaths([EXP_A, EXP_B], EXTERNAL_ROOT, "")).toEqual([
      "results/big.h5",
    ]);
  });

  it("matches the folder by whole segments, not by string prefix", () => {
    expect(capturedSourcePaths([EXP_A], "project", "res")).toEqual([]);
    expect(
      capturedSourcePaths([EXP_A], "project", "results/pca/pca.csv"),
    ).toEqual([]);
  });

  it("matches the folder without regard to case or normalisation, keeping the recorded spelling", () => {
    // The recorded path spells "é" composed (U+00E9); the folder spells it
    // decomposed ("e" + U+0301). They look identical but differ in bytes.
    const cafe = file(
      artefact("01JAXR5D8K2M4N6P8Q0R2S4T6F", "project", "Café/Plot.PNG"),
    );
    expect(capturedSourcePaths([cafe], "project", "café")).toEqual([
      "Plot.PNG",
    ]);
  });

  it("returns nothing for no experiments", () => {
    expect(capturedSourcePaths([], "project", "")).toEqual([]);
  });
});
