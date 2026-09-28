import type { ArtefactModel } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import type { RelinkCandidateDto } from "../../../ipc/bindings";
import { candidateKey, relinkExpectationOf } from "./relink";

const copy: ArtefactModel = {
  id: "01JB0000000000000000000001",
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
  ],
};

const linked: ArtefactModel = {
  id: "01JB0000000000000000000002",
  name: "Raw reads",
  role: "result",
  mode: "link",
  type: "table",
  source: { root: "project", path: "raw/reads.csv" },
  created: "2026-09-26T10:00:00Z",
  link: {
    sha256: "b".repeat(64),
    size: 150_000_000,
    observed_mtime: "2026-09-26T09:00:00Z",
    checked: "2026-09-27T09:00:00Z",
  },
};

describe("relinkExpectationOf", () => {
  it("is undefined for a copy-mode artefact", () => {
    expect(relinkExpectationOf(copy)).toBeUndefined();
  });

  it("is the last known name, size and hash of a linked artefact", () => {
    expect(relinkExpectationOf(linked)).toEqual({
      fileName: "reads.csv",
      size: 150_000_000,
      sha256: "b".repeat(64),
    });
  });

  it("uses the whole path as the name when there is no separator", () => {
    const rooted: ArtefactModel = {
      ...linked,
      source: { ...linked.source, path: "reads.csv" },
    };
    expect(relinkExpectationOf(rooted)?.fileName).toBe("reads.csv");
  });
});

describe("candidateKey", () => {
  it("is the same for two candidates at the same location", () => {
    const candidate = (path: string): RelinkCandidateDto => ({
      location: { root: "project", path },
      name: path.slice(path.lastIndexOf("/") + 1),
      sha256: "c".repeat(64),
      size: 150_000_000,
      observedMtime: "2026-09-28T09:00:00Z",
      nameMatches: true,
      sizeMatches: true,
      hashMatches: false,
    });
    const a = candidate("moved/reads.csv");
    const b = { ...candidate("moved/reads.csv") };
    expect(candidateKey(a)).toBe(candidateKey(b));
    expect(candidateKey(a)).not.toBe(candidateKey(candidate("other.csv")));
  });
});
