// Gate S3-G05: `pnpm test:vscode`. "Provenance commit and dirty flags
// correct in a test repository." Builds a real temporary git repository
// with the `git` CLI (fixture setup and independent verification only —
// production code never shells out to `git`; see vscode-git.ts) and checks
// computeProvenance against what `git` itself reports for the same repo,
// the same way apps/desktop/src-tauri/crates/nb-git/tests/provenance.rs
// verifies nb-git.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { computeProvenance, type RepositoryFacts } from "./git-provenance";

let workspace: string;
let repo: string;

const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
};

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, env: GIT_ENV }).toString();
}

/** Everything `vscode-git.ts` would read from the live Git extension API,
 * built here from direct `git` CLI calls instead, since no real VS Code
 * process is available under vitest. */
function readRepositoryFacts(repoRoot: string): RepositoryFacts {
  const headCommit = git(repoRoot, ["rev-parse", "HEAD"]).trim();
  const porcelain = git(repoRoot, [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const changedPaths = porcelain
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => {
      const status = line.slice(0, 2);
      const path = line.slice(3);
      return { path, tracked: status !== "??" };
    });
  return { rootPath: repoRoot, headCommit, changedPaths };
}

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "rn-vscode-git-"));
  repo = workspace;
  git(repo, ["init", "-q"]);
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

describe("computeProvenance against a real git repository", () => {
  it("records HEAD's true commit sha", () => {
    writeFileSync(join(repo, "a.txt"), "hello\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-q", "-m", "initial"]);

    const provenance = computeProvenance(
      join(repo, "a.txt"),
      repo,
      readRepositoryFacts(repo),
    );

    expect(provenance?.commit).toBe(git(repo, ["rev-parse", "HEAD"]).trim());
    expect(provenance?.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it("reports both flags false for a clean repository", () => {
    writeFileSync(join(repo, "a.txt"), "hello\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-q", "-m", "initial"]);

    const provenance = computeProvenance(
      join(repo, "a.txt"),
      repo,
      readRepositoryFacts(repo),
    );

    expect(provenance).toMatchObject({ file_dirty: false, tree_dirty: false });
  });

  it("sets file_dirty and tree_dirty when the file itself has an uncommitted change", () => {
    writeFileSync(join(repo, "a.txt"), "hello\n");
    writeFileSync(join(repo, "b.txt"), "world\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-q", "-m", "initial"]);
    writeFileSync(join(repo, "a.txt"), "hello again\n");

    const provenance = computeProvenance(
      join(repo, "a.txt"),
      repo,
      readRepositoryFacts(repo),
    );

    expect(provenance).toMatchObject({
      path_in_repo: "a.txt",
      file_dirty: true,
      tree_dirty: true,
    });
  });

  it("sets only tree_dirty when an unrelated tracked file changed", () => {
    writeFileSync(join(repo, "a.txt"), "hello\n");
    writeFileSync(join(repo, "b.txt"), "world\n");
    git(repo, ["add", "."]);
    git(repo, ["commit", "-q", "-m", "initial"]);
    writeFileSync(join(repo, "b.txt"), "world again\n");

    const provenance = computeProvenance(
      join(repo, "a.txt"),
      repo,
      readRepositoryFacts(repo),
    );

    expect(provenance).toMatchObject({ file_dirty: false, tree_dirty: true });
  });

  it("sets file_dirty for a brand new, untracked file", () => {
    writeFileSync(join(repo, "a.txt"), "hello\n");
    git(repo, ["add", "a.txt"]);
    git(repo, ["commit", "-q", "-m", "initial"]);
    writeFileSync(join(repo, "new.txt"), "new\n");

    const provenance = computeProvenance(
      join(repo, "new.txt"),
      repo,
      readRepositoryFacts(repo),
    );

    expect(provenance?.file_dirty).toBe(true);
  });

  it("does not set tree_dirty for an unrelated untracked file", () => {
    writeFileSync(join(repo, "a.txt"), "hello\n");
    git(repo, ["add", "a.txt"]);
    git(repo, ["commit", "-q", "-m", "initial"]);
    writeFileSync(join(repo, "scratch.txt"), "scratch\n");

    const provenance = computeProvenance(
      join(repo, "a.txt"),
      repo,
      readRepositoryFacts(repo),
    );

    expect(provenance).toMatchObject({ file_dirty: false, tree_dirty: false });
  });

  it("records path_in_repo relative to the repository root and repo relative to the project root, which can differ", () => {
    // The project root is the outer workspace; the git repository itself
    // is a subfolder within it (a vendored analysis repo), so the two
    // relative paths this records are genuinely different values.
    const projectRoot = workspace;
    const nestedRepo = join(workspace, "vendor", "analysis-repo");
    mkdirSync(nestedRepo, { recursive: true });
    git(nestedRepo, ["init", "-q"]);
    mkdirSync(join(nestedRepo, "results"), { recursive: true });
    writeFileSync(join(nestedRepo, "results", "a.txt"), "hello\n");
    git(nestedRepo, ["add", "."]);
    git(nestedRepo, ["commit", "-q", "-m", "initial"]);

    const provenance = computeProvenance(
      join(nestedRepo, "results", "a.txt"),
      projectRoot,
      readRepositoryFacts(nestedRepo),
    );

    expect(provenance).toMatchObject({
      repo: "vendor/analysis-repo",
      path_in_repo: "results/a.txt",
    });
  });
});
