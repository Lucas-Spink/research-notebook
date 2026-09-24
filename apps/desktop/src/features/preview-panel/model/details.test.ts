import { describe, expect, it } from "vitest";
import type { ArtefactModel } from "@research-notebook/format";
import {
  fileDetailsFor,
  latestVersion,
  linkFileName,
  previewPlanFor,
} from "./details";

const EXPERIMENT = "EXP-001";

const copyArtefact: ArtefactModel = {
  id: "01JB0000000000000000000001",
  name: "Volcano plot",
  role: "result",
  mode: "copy",
  type: "image",
  source: { root: "project", path: "out/volcano.png" },
  created: "2026-09-01T09:00:00Z",
  versions: [
    {
      v: 1,
      file: "evidence/volcano.png",
      sha256: "a".repeat(64),
      size: 100,
      captured: "2026-09-01T09:00:00Z",
    },
    {
      v: 2,
      file: "evidence/volcano-v2.png",
      sha256: "b".repeat(64),
      size: 200,
      captured: "2026-09-02T09:00:00Z",
      provenance: {
        repo: "..",
        commit: "c".repeat(40),
        path_in_repo: "scripts/plot.R",
        file_dirty: false,
        tree_dirty: true,
      },
    },
  ],
};

const linkArtefact: ArtefactModel = {
  id: "01JB0000000000000000000002",
  name: "Raw counts",
  role: "result",
  mode: "link",
  type: "table",
  source: { root: "01JAXA1C5D8E2F4G6H7J9K0M1N", path: "data/counts.h5" },
  created: "2026-09-01T09:00:00Z",
  link: {
    sha256: "d".repeat(64),
    size: 18_400_000_000,
    observed_mtime: "2026-09-01T09:00:00Z",
    checked: "2026-09-01T09:00:00Z",
  },
};

describe("latestVersion", () => {
  it("is the last (highest v) version of a copy-mode artefact", () => {
    expect(latestVersion(copyArtefact)?.v).toBe(2);
  });

  it("is undefined for a link-mode artefact", () => {
    expect(latestVersion(linkArtefact)).toBeUndefined();
  });
});

describe("fileDetailsFor", () => {
  it("gives the latest version's file name, size and project-relative location", () => {
    const details = fileDetailsFor(copyArtefact, EXPERIMENT);
    expect(details).toEqual({
      name: "Volcano plot",
      fileName: "volcano-v2.png",
      size: 200,
      location: "_notebook/experiments/EXP-001/evidence/volcano-v2.png",
    });
  });

  it("gives a linked artefact's file name from its source path and its recorded size", () => {
    const details = fileDetailsFor(linkArtefact, EXPERIMENT);
    expect(details).toEqual({
      name: "Raw counts",
      fileName: "counts.h5",
      size: 18_400_000_000,
      location: "data/counts.h5",
    });
  });
});

describe("linkFileName", () => {
  it("is the last segment of the source path", () => {
    expect(linkFileName(linkArtefact)).toBe("counts.h5");
  });
});

describe("previewPlanFor", () => {
  it("plans a captured preview for a copy-mode artefact from its latest version's file name", () => {
    expect(previewPlanFor(copyArtefact)).toEqual({ kind: "image" });
  });

  it("plans the linked, details-only fallback for a link-mode artefact", () => {
    expect(previewPlanFor(linkArtefact)).toEqual({
      kind: "other",
      reason: "linked",
    });
  });
});
