import type { ArtefactsFileModel } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { groupPathFor, searchArtefacts } from "./artefactSearch";

const FILE: ArtefactsFileModel = {
  format_version: 1,
  artefacts: [
    {
      id: "01PCA00000000000000000000",
      name: "PCA by treatment",
      role: "result",
      type: "table",
      mode: "copy",
      source: { root: "project", path: "scripts/pca.R" },
      created: "2026-01-01T00:00:00Z",
      versions: [
        {
          v: 1,
          file: "evidence/pca.v1.csv",
          sha256: "a".repeat(64),
          size: 10,
          captured: "2026-01-01T00:00:00Z",
        },
        {
          v: 2,
          file: "evidence/pca.v2.csv",
          sha256: "b".repeat(64),
          size: 20,
          captured: "2026-01-02T00:00:00Z",
        },
      ],
    },
    {
      id: "01RAW00000000000000000000",
      name: "Raw counts",
      role: "result",
      type: "table",
      mode: "link",
      source: { root: "project", path: "data/counts.h5" },
      created: "2026-01-01T00:00:00Z",
      link: {
        sha256: "c".repeat(64),
        size: 30,
        observed_mtime: "2026-01-01T00:00:00Z",
        checked: "2026-01-01T00:00:00Z",
      },
    },
    {
      id: "01HEAT0000000000000000000",
      name: "Heatmap",
      role: "result",
      type: "image",
      mode: "copy",
      source: { root: "project", path: "scripts/heatmap.py" },
      created: "2026-01-01T00:00:00Z",
      versions: [
        {
          v: 1,
          file: "evidence/heatmap.v1.png",
          sha256: "d".repeat(64),
          size: 40,
          captured: "2026-01-01T00:00:00Z",
        },
      ],
    },
    {
      id: "01QC000000000000000000000",
      name: "QC report",
      role: "result",
      type: "pdf",
      mode: "copy",
      source: { root: "project", path: "scripts/qc.py" },
      created: "2026-01-01T00:00:00Z",
      versions: [
        {
          v: 1,
          file: "methods/qc.v1.pdf",
          sha256: "e".repeat(64),
          size: 50,
          captured: "2026-01-01T00:00:00Z",
        },
      ],
    },
  ],
  groups: [
    {
      id: "g-figures",
      name: "Figures",
      items: ["01PCA00000000000000000000"],
      groups: [
        {
          id: "g-diagnostics",
          name: "Diagnostics",
          items: ["01QC000000000000000000000"],
          groups: [],
        },
      ],
    },
    {
      id: "g-shared",
      name: "Shared",
      items: ["01PCA00000000000000000000"],
      groups: [],
    },
  ],
};

describe("searchArtefacts (FR-EDT-04)", () => {
  it("lists every copy-mode artefact when the query is empty", () => {
    const rows = searchArtefacts(FILE, "");
    expect(rows.map((r) => r.id)).toEqual([
      "01PCA00000000000000000000",
      "01HEAT0000000000000000000",
      "01QC000000000000000000000",
    ]);
  });

  it("excludes link-mode artefacts", () => {
    const rows = searchArtefacts(FILE, "");
    expect(rows.some((r) => r.id === "01RAW00000000000000000000")).toBe(false);
  });

  it("uses the latest version's file and number", () => {
    const [pca] = searchArtefacts(FILE, "PCA");
    expect(pca).toMatchObject({
      fileName: "pca.v2.csv",
      target: "evidence/pca.v2.csv",
      version: 2,
    });
  });

  it("matches case-insensitively on display name", () => {
    expect(searchArtefacts(FILE, "pca").map((r) => r.id)).toEqual([
      "01PCA00000000000000000000",
    ]);
  });

  it("matches case-insensitively on filename", () => {
    expect(searchArtefacts(FILE, "heatmap.v1").map((r) => r.id)).toEqual([
      "01HEAT0000000000000000000",
    ]);
  });

  it("matches nothing when the query matches neither name nor filename", () => {
    expect(searchArtefacts(FILE, "nonexistent")).toEqual([]);
  });

  it("carries the artefact's type through", () => {
    const [, heatmap] = searchArtefacts(FILE, "");
    expect(heatmap?.type).toBe("image");
  });
});

describe("groupPathFor", () => {
  it("is null for an artefact in no group", () => {
    expect(groupPathFor(FILE, "01HEAT0000000000000000000")).toBeNull();
  });

  it("joins every membership when the artefact is in more than one group", () => {
    expect(groupPathFor(FILE, "01PCA00000000000000000000")).toBe(
      "Figures; Shared",
    );
  });

  it("is the full breadcrumb for a nested membership", () => {
    expect(groupPathFor(FILE, "01QC000000000000000000000")).toBe(
      "Figures / Diagnostics",
    );
  });
});
