import { describe, expect, it } from "vitest";
import type { ArtefactsFileModel } from "../schema";
import { checkSourceForUpdate } from "../index";

const EMPTY: ArtefactsFileModel = {
  format_version: 1,
  artefacts: [],
  groups: [],
};

function withCopyArtefact(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: "01JAXR5D8K2M4N6P8Q0R2S4T6V",
        name: "PCA by treatment",
        role: "result",
        mode: "copy",
        type: "pdf",
        source: { root: "project", path: "results/pca.pdf" },
        created: "2026-09-01T09:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/pca.pdf",
            sha256: "a".repeat(64),
            size: 100,
            captured: "2026-09-01T09:00:00Z",
          },
          {
            v: 2,
            file: "evidence/pca.v2.pdf",
            sha256: "b".repeat(64),
            size: 120,
            captured: "2026-09-05T09:00:00Z",
          },
        ],
      },
    ],
    groups: [],
  };
}

function withLinkArtefact(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: "01JAXR5D8K2M4N6P8Q0R2S4T6V",
        name: "Raw counts",
        role: "result",
        mode: "link",
        type: "other",
        source: { root: "project", path: "data/counts.h5" },
        created: "2026-09-01T09:00:00Z",
        link: {
          sha256: "c".repeat(64),
          size: 10,
          observed_mtime: "2026-09-01T09:00:00Z",
          checked: "2026-09-01T09:00:00Z",
        },
      },
    ],
    groups: [],
  };
}

describe("checkSourceForUpdate (FR-EVD-06)", () => {
  it("reports up to date when the source's hash matches the latest version", () => {
    const result = checkSourceForUpdate(
      withCopyArtefact(),
      "01JAXR5D8K2M4N6P8Q0R2S4T6V",
      "b".repeat(64),
    );
    expect(result).toEqual({ ok: true, value: { status: "upToDate" } });
  });

  it("reports changed when the source's hash differs from the latest version", () => {
    const result = checkSourceForUpdate(
      withCopyArtefact(),
      "01JAXR5D8K2M4N6P8Q0R2S4T6V",
      "d".repeat(64),
    );
    expect(result).toEqual({ ok: true, value: { status: "changed" } });
  });

  it("compares against the latest version, not an earlier one", () => {
    const result = checkSourceForUpdate(
      withCopyArtefact(),
      "01JAXR5D8K2M4N6P8Q0R2S4T6V",
      "a".repeat(64),
    );
    expect(result).toEqual({ ok: true, value: { status: "changed" } });
  });

  it("refuses an artefact id that does not exist", () => {
    const result = checkSourceForUpdate(
      EMPTY,
      "01JAXMISSING000000000000",
      "a".repeat(64),
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toEqual({
      kind: "notFound",
      entity: "artefact",
      id: "01JAXMISSING000000000000",
    });
  });

  it("refuses a link-mode artefact", () => {
    const result = checkSourceForUpdate(
      withLinkArtefact(),
      "01JAXR5D8K2M4N6P8Q0R2S4T6V",
      "c".repeat(64),
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe("invalid");
  });

  it("does not change the file it was given", () => {
    const file = withCopyArtefact();
    checkSourceForUpdate(file, "01JAXR5D8K2M4N6P8Q0R2S4T6V", "b".repeat(64));
    expect(file).toEqual(withCopyArtefact());
  });
});
