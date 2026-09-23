import { describe, expect, it } from "vitest";
import type { ArtefactsFileModel } from "../schema";
import {
  defaultDisplayName,
  inferArtefactType,
  knownVersionsFor,
  matchInboxSource,
  planInboxImport,
} from "../index";

const REQUEST_ID = "01JAXT0C4D6E8F0G2H4J6K8M0N";

function requestJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    format_version: 1,
    request_id: REQUEST_ID,
    created: "2026-09-22T11:00:00Z",
    created_by: "vscode-extension@0.1.0",
    experiment_id: "01JAXQ8M3K7T2V9R4W6Y5Z0B1C",
    role: "result",
    mode: "copy",
    source: { root: "project", path: "results/pca/pca.pdf" },
    payload: "pca.pdf",
    sha256: "a".repeat(64),
    size: 100,
    provenance: null,
    ...overrides,
  });
}

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
        source: { root: "project", path: "results/pca/pca.pdf" },
        created: "2026-09-01T09:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/pca_by_treatment.pdf",
            sha256: "b".repeat(64),
            size: 100,
            captured: "2026-09-01T09:00:00Z",
          },
          {
            v: 2,
            file: "evidence/pca_by_treatment.v2.pdf",
            sha256: "c".repeat(64),
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
        type: "table",
        source: { root: "project", path: "data/counts.h5" },
        created: "2026-09-01T09:00:00Z",
        link: {
          sha256: "d".repeat(64),
          size: 10,
          observed_mtime: "2026-09-01T09:00:00Z",
          checked: "2026-09-01T09:00:00Z",
        },
      },
    ],
    groups: [],
  };
}

describe("inferArtefactType", () => {
  it.each([
    ["figure.png", "image"],
    ["figure.JPG", "image"],
    ["report.pdf", "pdf"],
    ["diagram.svg", "svg"],
    ["data.csv", "table"],
    ["data.tsv", "table"],
    ["analysis.py", "script"],
    ["notebook.ipynb", "notebook"],
    ["page.html", "html"],
    ["notes.txt", "text"],
    ["archive.zip", "other"],
    ["no-extension", "other"],
  ])("maps %s to %s", (fileName, expected) => {
    expect(inferArtefactType(fileName)).toBe(expected);
  });
});

describe("defaultDisplayName", () => {
  it("strips the last extension", () => {
    expect(defaultDisplayName("PCA by treatment.pdf")).toBe("PCA by treatment");
  });

  it("leaves a name with no extension unchanged", () => {
    expect(defaultDisplayName("README")).toBe("README");
  });

  it("keeps a leading dot as part of the name", () => {
    expect(defaultDisplayName(".gitignore")).toBe(".gitignore");
  });
});

describe("matchInboxSource", () => {
  it("finds an artefact with the same source", () => {
    const file = withCopyArtefact();
    const found = matchInboxSource(file, {
      root: "project",
      path: "results/pca/pca.pdf",
    });
    expect(found?.id).toBe("01JAXR5D8K2M4N6P8Q0R2S4T6V");
  });

  it("finds nothing for an unrecorded source", () => {
    expect(
      matchInboxSource(EMPTY, { root: "project", path: "x" }),
    ).toBeUndefined();
  });
});

describe("knownVersionsFor", () => {
  it("flattens every copy-mode version, marking the matching artefact", () => {
    const file = withCopyArtefact();
    const known = knownVersionsFor(file, "01JAXR5D8K2M4N6P8Q0R2S4T6V");
    expect(known).toEqual([
      { sha256: "b".repeat(64), number: 1, sameArtefact: true },
      { sha256: "c".repeat(64), number: 2, sameArtefact: true },
    ]);
  });

  it("marks every version as a different artefact when no id is given", () => {
    const file = withCopyArtefact();
    const known = knownVersionsFor(file);
    expect(known.every((k) => !k.sameArtefact)).toBe(true);
  });

  it("ignores link-mode artefacts", () => {
    expect(knownVersionsFor(withLinkArtefact())).toEqual([]);
  });
});

describe("planInboxImport, invalid requests", () => {
  it("refuses text that is not valid JSON", () => {
    const result = planInboxImport({
      requestId: REQUEST_ID,
      requestText: "not json",
      file: EMPTY,
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error.kind).toBe("invalid");
  });

  it("refuses a request that fails schema validation", () => {
    const result = planInboxImport({
      requestId: REQUEST_ID,
      requestText: requestJson({ role: "not-a-role" }),
      file: EMPTY,
    });
    expect(result.ok).toBe(false);
  });

  it("refuses a request_id that does not match its folder name", () => {
    const result = planInboxImport({
      requestId: "01JMISMATCH00000000000000",
      requestText: requestJson(),
      file: EMPTY,
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({
      kind: "invalid",
      field: "request_id",
    });
  });

  it("refuses a request whose role disagrees with the matched artefact", () => {
    const result = planInboxImport({
      requestId: REQUEST_ID,
      requestText: requestJson({ role: "method" }),
      file: withCopyArtefact(),
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({
      kind: "invalid",
      field: "role",
    });
  });

  it("refuses a request whose mode disagrees with the matched artefact", () => {
    const result = planInboxImport({
      requestId: REQUEST_ID,
      requestText: requestJson({ mode: "link", payload: null }),
      file: withCopyArtefact(),
    });
    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.error).toMatchObject({
      kind: "invalid",
      field: "mode",
    });
  });
});

describe("planInboxImport, copy mode", () => {
  it("plans a new artefact when nothing matches the source", () => {
    const result = planInboxImport({
      requestId: REQUEST_ID,
      requestText: requestJson(),
      file: EMPTY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      kind: "copy",
      target: {
        kind: "new",
        name: "pca",
        role: "result",
        type: "pdf",
        source: { root: "project", path: "results/pca/pca.pdf" },
      },
      payload: "pca.pdf",
      sha256: "a".repeat(64),
      size: 100,
    });
  });

  it("plans a new version when the source matches an existing artefact", () => {
    const result = planInboxImport({
      requestId: REQUEST_ID,
      requestText: requestJson(),
      file: withCopyArtefact(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      kind: "copy",
      target: { kind: "existing", artefactId: "01JAXR5D8K2M4N6P8Q0R2S4T6V" },
      payload: "pca.pdf",
      sha256: "a".repeat(64),
      size: 100,
    });
  });
});

describe("planInboxImport, link mode", () => {
  function linkRequest(overrides: Record<string, unknown> = {}): string {
    return requestJson({
      mode: "link",
      payload: null,
      source: { root: "project", path: "data/counts.h5" },
      sha256: "d".repeat(64),
      size: 10,
      ...overrides,
    });
  }

  it("plans a new link artefact when nothing matches the source", () => {
    const result = planInboxImport({
      requestId: REQUEST_ID,
      requestText: linkRequest(),
      file: EMPTY,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      kind: "link",
      target: {
        name: "counts",
        role: "result",
        type: "other",
        source: { root: "project", path: "data/counts.h5" },
      },
      observation: {
        sha256: "d".repeat(64),
        size: 10,
        observedMtime: "2026-09-22T11:00:00Z",
      },
    });
  });

  it("plans a re-observation when the source matches an existing link artefact", () => {
    const result = planInboxImport({
      requestId: REQUEST_ID,
      requestText: linkRequest(),
      file: withLinkArtefact(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual({
      kind: "relink",
      artefactId: "01JAXR5D8K2M4N6P8Q0R2S4T6V",
      source: { root: "project", path: "data/counts.h5" },
      observation: {
        sha256: "d".repeat(64),
        size: 10,
        observedMtime: "2026-09-22T11:00:00Z",
      },
    });
  });
});
