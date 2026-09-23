import { describe, expect, it } from "vitest";

import { computeProvenance, type RepositoryFacts } from "./git-provenance";

const COMMIT = "a".repeat(40);

function facts(overrides: Partial<RepositoryFacts> = {}): RepositoryFacts {
  return {
    rootPath: "/project",
    headCommit: COMMIT,
    changedPaths: [],
    ...overrides,
  };
}

describe("computeProvenance", () => {
  it("records '.' when the repository root is the project root", () => {
    const result = computeProvenance(
      "/project/scripts/run.R",
      "/project",
      facts(),
    );
    expect(result).toEqual({
      repo: ".",
      commit: COMMIT,
      path_in_repo: "scripts/run.R",
      file_dirty: false,
      tree_dirty: false,
    });
  });

  it("records a forward-slash path when the repository is nested in the project", () => {
    const result = computeProvenance(
      "/project/vendor/analysis-repo/scripts/run.R",
      "/project",
      facts({ rootPath: "/project/vendor/analysis-repo" }),
    );
    expect(result?.repo).toBe("vendor/analysis-repo");
    expect(result?.path_in_repo).toBe("scripts/run.R");
  });

  it("is dirty for the file whether the change is tracked or untracked", () => {
    const untracked = computeProvenance(
      "/project/scripts/run.R",
      "/project",
      facts({ changedPaths: [{ path: "scripts/run.R", tracked: false }] }),
    );
    expect(untracked?.file_dirty).toBe(true);
    expect(untracked?.tree_dirty).toBe(false);

    const tracked = computeProvenance(
      "/project/scripts/run.R",
      "/project",
      facts({ changedPaths: [{ path: "scripts/run.R", tracked: true }] }),
    );
    expect(tracked?.file_dirty).toBe(true);
    expect(tracked?.tree_dirty).toBe(true);
  });

  it("is tree-dirty but not file-dirty when only an unrelated tracked file changed", () => {
    const result = computeProvenance(
      "/project/scripts/run.R",
      "/project",
      facts({ changedPaths: [{ path: "data/counts.csv", tracked: true }] }),
    );
    expect(result?.file_dirty).toBe(false);
    expect(result?.tree_dirty).toBe(true);
  });

  it("is not tree-dirty when only an unrelated untracked file exists", () => {
    const result = computeProvenance(
      "/project/scripts/run.R",
      "/project",
      facts({ changedPaths: [{ path: "data/scratch.tmp", tracked: false }] }),
    );
    expect(result?.tree_dirty).toBe(false);
  });

  it("is null when the repository root is an ancestor of the project root", () => {
    const result = computeProvenance(
      "/project/my-project/scripts/run.R",
      "/project/my-project",
      facts({ rootPath: "/project" }),
    );
    expect(result).toBeNull();
  });

  it("is null when the repository is unrelated to the project root", () => {
    const result = computeProvenance(
      "/elsewhere/scripts/run.R",
      "/project",
      facts({ rootPath: "/elsewhere" }),
    );
    expect(result).toBeNull();
  });

  it("is null when the repository has no commits yet", () => {
    const result = computeProvenance(
      "/project/scripts/run.R",
      "/project",
      facts({ headCommit: undefined }),
    );
    expect(result).toBeNull();
  });
});
