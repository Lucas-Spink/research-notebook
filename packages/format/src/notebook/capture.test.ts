import { describe, expect, it } from "vitest";
import { deepFreeze, must, testEnv } from "../../test/notebook-support";
import type { ArtefactsFileModel } from "../schema";
import { applyCapture } from "../index";

const EMPTY: ArtefactsFileModel = {
  format_version: 1,
  artefacts: [],
  groups: [],
};

function withArtefact(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: "01JAXR5D8K2M4N6P8Q0R2S4T6V",
        name: "PCA by treatment",
        role: "result",
        mode: "copy",
        type: "pdf",
        source: { root: "project", path: "results/pca/pca.pdf" },
        created: "2026-09-01T09:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/pca_by_treatment.pdf",
            sha256: "a".repeat(64),
            size: 100,
            captured: "2026-09-01T09:00:00Z",
          },
        ],
      },
    ],
    groups: [],
  };
}

describe("applyCapture, new artefact (FR-EVD-03)", () => {
  it("adds an artefact with one version, using the env's id and clock", () => {
    const env = testEnv();
    const result = must(
      applyCapture(
        EMPTY,
        {
          kind: "new",
          name: "PCA by treatment",
          role: "result",
          type: "pdf",
          source: { root: "project", path: "results/pca/pca.pdf" },
        },
        {
          file: "evidence/pca_by_treatment.pdf",
          sha256: "b".repeat(64),
          size: 88213,
          number: 1,
        },
        env,
      ),
    );

    expect(result.artefactId).toBe("01JAX000000000000000000001");
    expect(result.file.artefacts).toEqual([
      {
        id: "01JAX000000000000000000001",
        name: "PCA by treatment",
        role: "result",
        mode: "copy",
        type: "pdf",
        source: { root: "project", path: "results/pca/pca.pdf" },
        created: "2026-09-21T10:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/pca_by_treatment.pdf",
            sha256: "b".repeat(64),
            size: 88213,
            captured: "2026-09-21T10:00:00Z",
          },
        ],
      },
    ]);
  });

  it("does not change the file it was given", () => {
    const frozen = deepFreeze(EMPTY);
    const result = applyCapture(
      frozen,
      {
        kind: "new",
        name: "A",
        role: "result",
        type: "other",
        source: { root: "project", path: "a" },
      },
      { file: "evidence/a", sha256: "c".repeat(64), size: 1, number: 1 },
      testEnv(),
    );
    expect(result.ok).toBe(true);
  });
});

describe("applyCapture, existing artefact (FR-EVD-03, FR-EVD-04)", () => {
  it("appends a version, leaving the earlier one untouched", () => {
    const file = withArtefact();
    const env = testEnv({ at: "2026-09-22T11:00:00Z" });
    const result = must(
      applyCapture(
        file,
        { kind: "existing", artefactId: "01JAXR5D8K2M4N6P8Q0R2S4T6V" },
        {
          file: "evidence/pca_by_treatment.v2.pdf",
          sha256: "d".repeat(64),
          size: 200,
          number: 2,
        },
        env,
      ),
    );

    const artefact = result.file.artefacts[0];
    expect(artefact?.mode).toBe("copy");
    expect(artefact?.mode === "copy" ? artefact.versions : null).toEqual([
      {
        v: 1,
        file: "evidence/pca_by_treatment.pdf",
        sha256: "a".repeat(64),
        size: 100,
        captured: "2026-09-01T09:00:00Z",
      },
      {
        v: 2,
        file: "evidence/pca_by_treatment.v2.pdf",
        sha256: "d".repeat(64),
        size: 200,
        captured: "2026-09-22T11:00:00Z",
      },
    ]);
  });

  it("refuses an artefact id that does not exist", () => {
    const result = applyCapture(
      EMPTY,
      { kind: "existing", artefactId: "01JAXMISSING000000000000" },
      { file: "evidence/x", sha256: "e".repeat(64), size: 1, number: 1 },
      testEnv(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toEqual({
      kind: "notFound",
      entity: "artefact",
      id: "01JAXMISSING000000000000",
    });
  });

  it("refuses a link-mode artefact", () => {
    const file: ArtefactsFileModel = {
      format_version: 1,
      artefacts: [
        {
          id: "01JAXR5D8K2M4N6P8Q0R2S4T6V",
          name: "Raw counts",
          role: "result",
          mode: "link",
          type: "table",
          source: { root: "project", path: "data/counts.csv" },
          created: "2026-09-01T09:00:00Z",
          link: {
            sha256: "f".repeat(64),
            size: 10,
            observed_mtime: "2026-09-01T09:00:00Z",
            checked: "2026-09-01T09:00:00Z",
          },
        },
      ],
      groups: [],
    };
    const result = applyCapture(
      file,
      { kind: "existing", artefactId: "01JAXR5D8K2M4N6P8Q0R2S4T6V" },
      { file: "evidence/x", sha256: "0".repeat(64), size: 1, number: 1 },
      testEnv(),
    );
    expect(result.ok ? null : result.error.kind).toBe("invalid");
  });

  it("refuses a version not numbered after the last one", () => {
    const file = withArtefact();
    const result = applyCapture(
      file,
      { kind: "existing", artefactId: "01JAXR5D8K2M4N6P8Q0R2S4T6V" },
      {
        file: "evidence/pca_by_treatment.v1.pdf",
        sha256: "d".repeat(64),
        size: 200,
        number: 1,
      },
      testEnv(),
    );
    expect(result.ok ? null : result.error.kind).toBe("invalid");
  });

  it("does not change the file it was given", () => {
    const frozen = deepFreeze(withArtefact());
    const result = applyCapture(
      frozen,
      { kind: "existing", artefactId: "01JAXR5D8K2M4N6P8Q0R2S4T6V" },
      {
        file: "evidence/pca_by_treatment.v2.pdf",
        sha256: "d".repeat(64),
        size: 200,
        number: 2,
      },
      testEnv(),
    );
    expect(result.ok).toBe(true);
  });
});
