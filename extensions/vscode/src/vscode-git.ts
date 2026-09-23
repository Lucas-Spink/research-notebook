import * as vscode from "vscode";

import type { RepositoryFacts } from "./git-provenance";

/**
 * The subset of VS Code's built-in Git extension API (`vscode.git`,
 * FR-VSC-05) this adapter reads. That API is not part of `@types/vscode`
 * (it is contributed by the `vscode.git` extension itself, with its own
 * `git.d.ts` that is not published as an installable package), so this is
 * a minimal, hand-written shape of only the fields used here, in the same
 * spirit Microsoft's own "git-extension-sample" takes.
 *
 * REVIEW: `UNTRACKED_STATUS` below is this file's one unverifiable
 * constant — see its comment.
 */
interface GitChange {
  readonly uri: vscode.Uri;
  readonly status: number;
}
interface GitRepositoryState {
  readonly HEAD: { readonly commit?: string } | undefined;
  readonly workingTreeChanges: readonly GitChange[];
  readonly indexChanges: readonly GitChange[];
}
interface GitRepository {
  readonly rootUri: vscode.Uri;
  readonly state: GitRepositoryState;
}
interface GitApi {
  readonly repositories: readonly GitRepository[];
}
interface GitExtensionExports {
  getAPI(version: 1): GitApi;
}

/**
 * `Status.UNTRACKED` in the Git extension's own `Status` enum
 * (`extensions/git/src/api/git.d.ts` in microsoft/vscode), used to tell an
 * untracked new file apart from a tracked one in `workingTreeChanges`
 * (`indexChanges` entries are always tracked: staging an addition tracks
 * it). REVIEW: taken from the enum's documented declaration order
 * (`INDEX_MODIFIED, INDEX_ADDED, INDEX_DELETED, INDEX_RENAMED,
 * INDEX_COPIED, MODIFIED, DELETED, UNTRACKED, ...`), not confirmed against
 * an installed VS Code's own copy of that file — please check it against
 * the current Git extension before relying on `tree_dirty` in production.
 */
const UNTRACKED_STATUS = 7;

function findGitApi(): GitApi | undefined {
  const extension =
    vscode.extensions.getExtension<GitExtensionExports>("vscode.git");
  return extension?.exports.getAPI(1);
}

function findRepository(
  api: GitApi,
  fileUri: vscode.Uri,
): GitRepository | undefined {
  return api.repositories.find((repo) =>
    fileUri.fsPath.startsWith(repo.rootUri.fsPath),
  );
}

/**
 * Reads the live state of the git repository containing `fileUri` from VS
 * Code's Git extension API (FR-VSC-05), or `undefined` when the Git
 * extension is not installed or enabled, or the file is not inside any
 * repository it has opened. Only ever reads; never stages, commits or
 * otherwise changes anything (FR-VSC-06).
 */
export function getRepositoryFacts(
  fileUri: vscode.Uri,
): RepositoryFacts | undefined {
  const api = findGitApi();
  if (api === undefined) return undefined;
  const repo = findRepository(api, fileUri);
  if (repo === undefined) return undefined;

  const changedPaths = [
    ...repo.state.indexChanges,
    ...repo.state.workingTreeChanges,
  ].map((change) => ({
    path: change.uri.fsPath,
    tracked: change.status !== UNTRACKED_STATUS,
  }));

  return {
    rootPath: repo.rootUri.fsPath,
    headCommit: repo.state.HEAD?.commit,
    changedPaths: changedPaths.map((c) => ({
      ...c,
      // computeProvenance expects repo-root-relative, forward-slash paths.
      path: relativeToRoot(repo.rootUri.fsPath, c.path),
    })),
  };
}

function relativeToRoot(root: string, absolute: string): string {
  const rest = absolute.startsWith(root)
    ? absolute.slice(root.length)
    : absolute;
  return rest
    .replace(/^[/\\]+/, "")
    .split(/[/\\]+/)
    .join("/");
}
