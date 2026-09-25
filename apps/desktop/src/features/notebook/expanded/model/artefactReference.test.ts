import { describe, expect, it } from "vitest";
import type { ArtefactsFileModel } from "@research-notebook/format";
import { readReferenceAttrs, resolveReference } from "./artefactReference";

const COPY_ID = "01JB0000000000000000000001";
const LINK_ID = "01JB0000000000000000000002";

function sample(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: COPY_ID,
        name: "PCA by treatment",
        role: "result",
        mode: "copy",
        type: "pdf",
        source: { root: "project", path: "scripts/pca.R" },
        created: "2026-01-01T00:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/pca.v1.pdf",
            sha256: "a".repeat(64),
            size: 10,
            captured: "2026-01-01T00:00:00Z",
          },
          {
            v: 2,
            file: "evidence/pca.v2.pdf",
            sha256: "b".repeat(64),
            size: 20,
            captured: "2026-01-02T00:00:00Z",
          },
        ],
      },
      {
        id: LINK_ID,
        name: "Raw counts",
        role: "result",
        mode: "link",
        type: "table",
        source: { root: "project", path: "data/counts.h5" },
        created: "2026-01-01T00:00:00Z",
        link: {
          sha256: "c".repeat(64),
          size: 100,
          observed_mtime: "2026-01-01T00:00:00Z",
          checked: "2026-01-01T00:00:00Z",
        },
      },
    ],
    groups: [],
  };
}

describe("readReferenceAttrs", () => {
  it("reads a well-formed attrs object", () => {
    expect(
      readReferenceAttrs({
        ulid: COPY_ID,
        version: 1,
        label: "PCA by treatment",
      }),
    ).toEqual({ ulid: COPY_ID, version: 1, label: "PCA by treatment" });
  });

  it("falls back to nulls and an empty label for anything malformed", () => {
    expect(readReferenceAttrs(undefined)).toEqual({
      ulid: null,
      version: null,
      label: "",
    });
    expect(readReferenceAttrs({ ulid: 42, version: "x", label: null })).toEqual(
      { ulid: null, version: null, label: "" },
    );
  });
});

describe("resolveReference", () => {
  it("is pending while the artefacts file has not loaded, keeping the stored label", () => {
    expect(
      resolveReference(null, { ulid: COPY_ID, version: 1, label: "Old name" }),
    ).toEqual({ status: "pending", label: "Old name" });
  });

  it("is detached when the ULID is not in the file, keeping the stored label", () => {
    expect(
      resolveReference(sample(), {
        ulid: "01JB0000000000000000000099",
        version: 1,
        label: "Removed artefact",
      }),
    ).toEqual({ status: "detached", label: "Removed artefact" });
  });

  it("is detached when the pinned version no longer exists on the artefact", () => {
    expect(
      resolveReference(sample(), {
        ulid: COPY_ID,
        version: 99,
        label: "PCA by treatment",
      }),
    ).toEqual({ status: "detached", label: "PCA by treatment" });
  });

  it("resolves a copy-mode reference to the artefact's current name and the pinned version's file", () => {
    expect(
      resolveReference(sample(), {
        ulid: COPY_ID,
        version: 1,
        label: "Stale label",
      }),
    ).toEqual({
      status: "resolved",
      artefact: sample().artefacts[0],
      label: "PCA by treatment",
      fileName: "pca.v1.pdf",
      version: 1,
    });
  });

  it("resolves a link-mode reference to the artefact's current name and source file name, with no version", () => {
    expect(
      resolveReference(sample(), {
        ulid: LINK_ID,
        version: null,
        label: "Stale label",
      }),
    ).toEqual({
      status: "resolved",
      artefact: sample().artefacts[1],
      label: "Raw counts",
      fileName: "counts.h5",
      version: null,
    });
  });
});
