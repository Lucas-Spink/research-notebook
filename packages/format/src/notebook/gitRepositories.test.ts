import { describe, expect, it } from "vitest";
import { arrangedFrom, loadedExperiment } from "../../test/notebook-support";
import { ArtefactsFile } from "../schema";
import { gitRepositories } from "./gitRepositories";

const COMMIT_A = "a".repeat(40);
const COMMIT_B = "b".repeat(40);
const HASH = "c".repeat(64);
const id = (n: number) =>
  `01JB00000000000000000000${String(n).padStart(2, "0")}`;

type Spec = { repo: string; commit: string } | null;

function version(v: number, spec: Spec) {
  return {
    v,
    file: `evidence/f${v}.txt`,
    sha256: HASH,
    size: 1,
    captured: "2026-09-03T14:02:11Z",
    ...(spec === null
      ? {}
      : {
          provenance: {
            repo: spec.repo,
            commit: spec.commit,
            path_in_repo: "a.R",
            file_dirty: false,
            tree_dirty: false,
          },
        }),
  };
}

function project(artefacts: readonly (readonly Spec[])[]) {
  const file = ArtefactsFile.parse({
    format_version: 1,
    artefacts: artefacts.map((specs, index) => ({
      id: id(index + 1),
      name: `Artefact ${index + 1}`,
      role: "result",
      mode: "copy",
      type: "other",
      source: { root: "project", path: "a.txt" },
      created: "2026-09-03T14:02:11Z",
      versions: specs.map((spec, v) => version(v + 1, spec)),
    })),
    groups: [],
  });
  const arranged = arrangedFrom([
    loadedExperiment("EXP-001", "EXP-001", "Q1", {}),
  ]);
  const [item] = arranged.unassigned;
  if (item === undefined) throw new Error("fixture");
  item.artefacts = { kind: "file", file };
  return arranged;
}

describe("gitRepositories (FR-ARC-04)", () => {
  it("lists a repository once however many versions cite it", () => {
    const arranged = project([
      [
        { repo: "code", commit: COMMIT_A },
        { repo: "code", commit: COMMIT_B },
      ],
      [{ repo: "code", commit: COMMIT_A }],
    ]);
    expect(gitRepositories(arranged)).toEqual([
      { repo: "code", commits: [COMMIT_A, COMMIT_B] },
    ]);
  });

  it("skips versions captured without provenance", () => {
    const arranged = project([[null, { repo: ".", commit: COMMIT_A }]]);
    expect(gitRepositories(arranged)).toEqual([
      { repo: ".", commits: [COMMIT_A] },
    ]);
  });

  it("is empty when no version has provenance", () => {
    expect(gitRepositories(project([[null]]))).toEqual([]);
  });

  it("sorts repositories so the same project gives the same list", () => {
    const arranged = project([
      [{ repo: "z", commit: COMMIT_A }],
      [{ repo: "a/b", commit: COMMIT_A }],
    ]);
    expect(gitRepositories(arranged).map((r) => r.repo)).toEqual(["a/b", "z"]);
  });
});
