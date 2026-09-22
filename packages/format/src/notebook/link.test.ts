import { describe, expect, it } from "vitest";
import { deepFreeze, must, testEnv } from "../../test/notebook-support";
import type { ArtefactsFileModel } from "../schema";
import { applyLink, applyLinkChecked, applyRelink } from "../index";

const EMPTY: ArtefactsFileModel = {
  format_version: 1,
  artefacts: [],
  groups: [],
};

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
          sha256: "a".repeat(64),
          size: 18_400_000_000,
          observed_mtime: "2026-08-30T22:14:09Z",
          checked: "2026-09-01T09:00:00Z",
        },
      },
    ],
    groups: [],
  };
}

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
            sha256: "b".repeat(64),
            size: 100,
            captured: "2026-09-01T09:00:00Z",
          },
        ],
      },
    ],
    groups: [],
  };
}

describe("applyLink (FR-EVD-02, FR-EVD-07)", () => {
  it("adds a link-mode artefact with no versions, using the env's id and clock", () => {
    const env = testEnv();
    const result = must(
      applyLink(
        EMPTY,
        {
          name: "Raw counts",
          role: "result",
          type: "other",
          source: { root: "project", path: "data/counts.h5" },
        },
        {
          sha256: "c".repeat(64),
          size: 18_400_000_000,
          observedMtime: "2026-08-30T22:14:09Z",
        },
        env,
      ),
    );

    expect(result.artefactId).toBe("01JAX000000000000000000001");
    expect(result.file.artefacts).toEqual([
      {
        id: "01JAX000000000000000000001",
        name: "Raw counts",
        role: "result",
        mode: "link",
        type: "other",
        source: { root: "project", path: "data/counts.h5" },
        created: "2026-09-21T10:00:00Z",
        link: {
          sha256: "c".repeat(64),
          size: 18_400_000_000,
          observed_mtime: "2026-08-30T22:14:09Z",
          checked: "2026-09-21T10:00:00Z",
        },
      },
    ]);
  });

  it("does not change the file it was given", () => {
    const frozen = deepFreeze(EMPTY);
    const result = applyLink(
      frozen,
      {
        name: "A",
        role: "result",
        type: "other",
        source: { root: "project", path: "a" },
      },
      {
        sha256: "d".repeat(64),
        size: 1,
        observedMtime: "2026-09-01T00:00:00Z",
      },
      testEnv(),
    );
    expect(result.ok).toBe(true);
  });
});

describe("applyLinkChecked (FR-EVD-07, FR-EVD-08)", () => {
  it("updates only the checked timestamp, leaving the recorded observation alone", () => {
    const file = withLinkArtefact();
    const env = testEnv({ at: "2026-09-22T12:00:00Z" });

    const result = must(
      applyLinkChecked(file, "01JAXR5D8K2M4N6P8Q0R2S4T6V", env),
    );

    const artefact = result.file.artefacts[0];
    expect(artefact?.mode).toBe("link");
    expect(artefact?.mode === "link" ? artefact.link : null).toEqual({
      sha256: "a".repeat(64),
      size: 18_400_000_000,
      observed_mtime: "2026-08-30T22:14:09Z",
      checked: "2026-09-22T12:00:00Z",
    });
  });

  it("records a check even though nothing else changes (a missing file leaves no other trace)", () => {
    const file = withLinkArtefact();
    const before = file.artefacts[0];
    const result = must(
      applyLinkChecked(file, "01JAXR5D8K2M4N6P8Q0R2S4T6V", testEnv()),
    );
    const after = result.file.artefacts[0];
    expect(after?.name).toBe(before?.name);
    expect(after?.source).toEqual(before?.source);
  });

  it("refuses an artefact id that does not exist", () => {
    const result = applyLinkChecked(
      EMPTY,
      "01JAXMISSING000000000000",
      testEnv(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toEqual({
      kind: "notFound",
      entity: "artefact",
      id: "01JAXMISSING000000000000",
    });
  });

  it("refuses a copy-mode artefact", () => {
    const result = applyLinkChecked(
      withCopyArtefact(),
      "01JAXR5D8K2M4N6P8Q0R2S4T6V",
      testEnv(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe("notFound");
  });

  it("does not change the file it was given", () => {
    const frozen = deepFreeze(withLinkArtefact());
    const result = applyLinkChecked(
      frozen,
      "01JAXR5D8K2M4N6P8Q0R2S4T6V",
      testEnv(),
    );
    expect(result.ok).toBe(true);
  });
});

describe("applyRelink (FR-EVD-08)", () => {
  it("points the artefact at the new source and replaces the link record", () => {
    const file = withLinkArtefact();
    const env = testEnv({ at: "2026-09-23T09:00:00Z" });

    const result = must(
      applyRelink(
        file,
        "01JAXR5D8K2M4N6P8Q0R2S4T6V",
        { root: "project", path: "archive/counts-renamed.h5" },
        {
          sha256: "a".repeat(64),
          size: 18_400_000_000,
          observedMtime: "2026-09-23T08:00:00Z",
        },
        env,
      ),
    );

    const artefact = result.file.artefacts[0];
    expect(artefact?.source).toEqual({
      root: "project",
      path: "archive/counts-renamed.h5",
    });
    expect(artefact?.mode === "link" ? artefact.link : null).toEqual({
      sha256: "a".repeat(64),
      size: 18_400_000_000,
      observed_mtime: "2026-09-23T08:00:00Z",
      checked: "2026-09-23T09:00:00Z",
    });
  });

  it("refuses an artefact id that does not exist", () => {
    const result = applyRelink(
      EMPTY,
      "01JAXMISSING000000000000",
      { root: "project", path: "x" },
      {
        sha256: "e".repeat(64),
        size: 1,
        observedMtime: "2026-09-01T00:00:00Z",
      },
      testEnv(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toEqual({
      kind: "notFound",
      entity: "artefact",
      id: "01JAXMISSING000000000000",
    });
  });

  it("refuses a copy-mode artefact", () => {
    const result = applyRelink(
      withCopyArtefact(),
      "01JAXR5D8K2M4N6P8Q0R2S4T6V",
      { root: "project", path: "x" },
      {
        sha256: "e".repeat(64),
        size: 1,
        observedMtime: "2026-09-01T00:00:00Z",
      },
      testEnv(),
    );
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe("notFound");
  });

  it("does not change the file it was given", () => {
    const frozen = deepFreeze(withLinkArtefact());
    const result = applyRelink(
      frozen,
      "01JAXR5D8K2M4N6P8Q0R2S4T6V",
      { root: "project", path: "archive/counts-renamed.h5" },
      {
        sha256: "a".repeat(64),
        size: 1,
        observedMtime: "2026-09-01T00:00:00Z",
      },
      testEnv(),
    );
    expect(result.ok).toBe(true);
  });
});
