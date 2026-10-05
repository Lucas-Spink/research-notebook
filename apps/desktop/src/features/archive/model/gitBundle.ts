import {
  gitRepositories,
  type Arranged,
  type Result,
} from "@research-notebook/format";
import type { commands, GitBundleOutcome } from "../../../ipc/bindings";

/** The one command git bundles are made through; it writes under `exports/git/`. */
export type GitBundleApi = Pick<typeof commands, "writeGitBundles">;

/** What became of one repository that provenance references. */
export type RepositoryBundle = { repo: string; outcome: GitBundleOutcome };

/** Why no bundles were attempted or reported. Nothing is claimed in either case. */
export type GitBundleFailure = "notWritable" | "writeFailed";

/**
 * Writes a git bundle of each repository the captured files were taken from
 * (FR-ARC-04). `packages/format` says which repositories those are. Each gets
 * its own answer, so one that cannot be bundled does not hide the others. A
 * reply that does not account for every repository is a failure, never a
 * shorter list that would read as "the rest were fine".
 */
export async function writeGitBundles(input: {
  api: GitBundleApi;
  folder: number;
  arranged: Arranged;
}): Promise<Result<RepositoryBundle[], GitBundleFailure>> {
  const { api, folder, arranged } = input;
  const repos = gitRepositories(arranged).map((r) => r.repo);
  if (repos.length === 0) return { ok: true, value: [] };

  const answered = await api.writeGitBundles(folder, repos).catch(() => null);
  if (answered === null) return { ok: false, error: "writeFailed" };
  if (answered.status !== "ok") {
    return {
      ok: false,
      error:
        answered.error.kind === "notWritable" ? "notWritable" : "writeFailed",
    };
  }
  if (answered.data.length !== repos.length) {
    return { ok: false, error: "writeFailed" };
  }
  const value: RepositoryBundle[] = [];
  repos.forEach((repo, index) => {
    const outcome = answered.data[index];
    if (outcome !== undefined) value.push({ repo, outcome });
  });
  return { ok: true, value };
}
