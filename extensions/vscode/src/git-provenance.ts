import { isAbsolute, relative, sep } from "node:path";

/**
 * What a git adapter (in production, `vscode-git.ts`; in tests, direct
 * `git` CLI calls against a real repository) has read of a repository:
 * enough for [`computeProvenance`] to decide everything spec 5.8's
 * `provenance` object needs, without reading git itself.
 */
export interface RepositoryFacts {
  /** Absolute path to the repository's working tree root. */
  rootPath: string;
  /** 40-character hexadecimal HEAD commit SHA, or `undefined` when the
   * repository has no commits yet. */
  headCommit: string | undefined;
  /** Repository-root-relative, forward-slash paths with an uncommitted
   * change in the working tree or the index, each marked whether git
   * tracks it (an untracked new file is still reported, just marked
   * `tracked: false`). */
  changedPaths: { path: string; tracked: boolean }[];
}

/** Spec 5.8/5.10 `provenance`. */
export interface ProvenanceValue {
  repo: string;
  commit: string;
  path_in_repo: string;
  file_dirty: boolean;
  tree_dirty: boolean;
}

/** `target` expressed relative to `base` (forward-slash), `"."` when they
 * are the same path, or `null` when `target` is not `base` or a descendant
 * of it — the same cases `nb-git`'s `repo_relative_to_project` (spec 5.8,
 * ADR-0032) and `path_in_repo` computation both need. */
function relativeDescendant(base: string, target: string): string | null {
  const rel = relative(base, target);
  if (rel === "") return ".";
  if (rel.startsWith("..") || isAbsolute(rel)) return null;
  return rel.split(sep).join("/");
}

/**
 * Git provenance for `filePath` (FR-VSC-05, FR-EVD-12), a direct port of
 * `nb-git`'s `provenance_in_project` (`apps/desktop/src-tauri/crates/nb-git/src/lib.rs`,
 * ADR-0018, ADR-0032), so the desktop app and this extension record the
 * same facts the same way regardless of which reads git. `null` when the
 * repository has no commits yet (no `commit` to record), or when its root
 * cannot be expressed as `project_root` or a descendant of it (spec 5.2's
 * `path` type forbids `..` segments).
 *
 * `file_dirty` is true whenever `filePath` itself appears in
 * `facts.changedPaths`, tracked or not: a brand new, not-yet-committed file
 * is trivially "dirty" relative to `HEAD`. `tree_dirty` only counts
 * *tracked* changes, matching gix's `is_dirty()`, which the desktop app's
 * capture already uses — an unrelated untracked file elsewhere in the
 * working tree does not make the whole repository "dirty".
 */
export function computeProvenance(
  filePath: string,
  projectRoot: string,
  facts: RepositoryFacts,
): ProvenanceValue | null {
  if (facts.headCommit === undefined) return null;
  const repo = relativeDescendant(projectRoot, facts.rootPath);
  if (repo === null) return null;
  const pathInRepo = relativeDescendant(facts.rootPath, filePath);
  if (pathInRepo === null || pathInRepo === ".") return null;

  const fileDirty = facts.changedPaths.some((c) => c.path === pathInRepo);
  const treeDirty = facts.changedPaths.some((c) => c.tracked);

  return {
    repo,
    commit: facts.headCommit,
    path_in_repo: pathInRepo,
    file_dirty: fileDirty,
    tree_dirty: treeDirty,
  };
}
