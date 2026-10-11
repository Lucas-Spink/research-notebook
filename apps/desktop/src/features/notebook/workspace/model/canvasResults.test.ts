import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  arrangeNotebook,
  type NotebookState,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { sampleNotebook } from "../../model/fakeApi";
import { resolveResult } from "./canvasResults";

/**
 * ADR-0064: a card points at an experiment, an artefact and a version, and
 * must find them again or say what is missing.
 */

const { state, one, two } = sampleNotebook();
const COPY = "01JB0000000000000000000001";
const LINK = "01JB0000000000000000000002";

const file = ArtefactsFile.parse({
  ...EMPTY_ARTEFACTS,
  artefacts: [
    {
      id: COPY,
      name: "PCA plot",
      role: "result",
      mode: "copy",
      type: "image",
      source: { root: "project", path: "results/pca.png" },
      created: "2026-09-26T10:00:00Z",
      versions: [
        {
          v: 1,
          file: "evidence/pca.png",
          sha256: "a".repeat(64),
          size: 10,
          captured: "2026-09-26T10:00:00Z",
        },
        {
          v: 3,
          file: "evidence/pca.v3.png",
          sha256: "b".repeat(64),
          size: 12,
          captured: "2026-09-27T10:00:00Z",
        },
      ],
    },
    {
      id: LINK,
      name: "Counts",
      role: "result",
      mode: "link",
      type: "table",
      source: { root: "project", path: "results/counts.csv" },
      created: "2026-09-26T10:00:00Z",
      link: {
        sha256: "c".repeat(64),
        size: 5,
        observed_mtime: "2026-09-26T10:00:00Z",
        checked: "2026-09-26T10:00:00Z",
      },
    },
  ],
});
const withFile: NotebookState = {
  ...state,
  artefacts: { ...state.artefacts, "EXP-001": { kind: "file", file } },
};
const arranged = arrangeNotebook(withFile);

describe("resolveResult", () => {
  it("finds a pinned version of a copied result, with the newest there is", () => {
    expect(
      resolveResult(arranged, {
        experimentId: one,
        artefactId: COPY,
        version: 1,
      }),
    ).toEqual({
      status: "found",
      artefactId: COPY,
      name: "PCA plot",
      type: "image",
      experimentRef: "EXP-001",
      experimentTitle: "One",
      experimentFolder: "EXP-001",
      mode: "copy",
      shownVersion: 1,
      latestVersion: 3,
      fileName: "evidence/pca.png",
      sha256: "a".repeat(64),
      captured: true,
    });
  });

  it("shows the newest version of a copied result that was pinned without one", () => {
    const found = resolveResult(arranged, {
      experimentId: one,
      artefactId: COPY,
    });
    expect(found).toMatchObject({
      shownVersion: 3,
      fileName: "evidence/pca.v3.png",
    });
  });

  it("finds a linked result, which has no versions", () => {
    expect(
      resolveResult(arranged, { experimentId: one, artefactId: LINK }),
    ).toMatchObject({
      status: "found",
      mode: "link",
      shownVersion: null,
      latestVersion: null,
      captured: false,
      sha256: "c".repeat(64),
      fileName: "results/counts.csv",
    });
  });

  it("says when the experiment is gone", () => {
    expect(
      resolveResult(arranged, {
        experimentId: "01JAXE00000000000000000099",
        artefactId: COPY,
      }),
    ).toEqual({ status: "missing", reason: "experiment" });
  });

  it("says when the artefact is gone", () => {
    expect(
      resolveResult(arranged, {
        experimentId: one,
        artefactId: "01JB0000000000000000000099",
      }),
    ).toEqual({ status: "missing", reason: "artefact" });
  });

  it("says when the version pinned is not one of the result's versions", () => {
    expect(
      resolveResult(arranged, {
        experimentId: one,
        artefactId: COPY,
        version: 2,
      }),
    ).toEqual({ status: "missing", reason: "version" });
  });

  it("reports an experiment whose artefacts file could not be read as missing its artefact, and does not read it", () => {
    const damaged = arrangeNotebook({
      ...state,
      artefacts: {
        ...state.artefacts,
        "EXP-002": { kind: "unreadable" },
      },
    });
    expect(
      resolveResult(damaged, { experimentId: two, artefactId: COPY }),
    ).toEqual({ status: "missing", reason: "artefact" });
  });

  it("looks for the artefact in the experiment named, not in any other", () => {
    expect(
      resolveResult(arranged, { experimentId: two, artefactId: COPY }),
    ).toEqual({ status: "missing", reason: "artefact" });
  });
});
