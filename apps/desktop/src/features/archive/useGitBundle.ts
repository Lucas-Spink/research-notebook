import { gitRepositories, type Arranged } from "@research-notebook/format";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  writeGitBundles,
  type GitBundleApi,
  type GitBundleFailure,
  type RepositoryBundle,
} from "./model/gitBundle";

/** What the git bundle panel shows: the repositories, the last attempt and how it ended. */
export type GitBundleModel = {
  state: "idle" | "running" | "done" | "failed";
  /** Repositories that provenance references, sorted. */
  repositories: readonly string[];
  results: readonly RepositoryBundle[];
  failure: GitBundleFailure | null;
  /** Whether this application may write the project; the bundles are files in it. */
  writable: boolean;
  run: () => void;
};

type Options = {
  api: GitBundleApi;
  folder: number;
  arranged: Arranged | null;
  writable: boolean;
};

/** Writes git bundles on request (FR-ARC-04). Optional: never runs by itself. */
export function useGitBundle(options: Options): GitBundleModel {
  const [state, setState] = useState<GitBundleModel["state"]>("idle");
  const [results, setResults] = useState<readonly RepositoryBundle[]>([]);
  const [failure, setFailure] = useState<GitBundleFailure | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const { arranged } = options;
  const repositories = useMemo(
    () =>
      arranged === null ? [] : gitRepositories(arranged).map((r) => r.repo),
    [arranged],
  );

  const run = useCallback(() => {
    const { api, folder, arranged, writable } = latest.current;
    if (arranged === null || !writable) return;
    setState("running");
    void writeGitBundles({ api, folder, arranged })
      .then((result) => {
        setResults(result.ok ? result.value : []);
        setFailure(result.ok ? null : result.error);
        setState(result.ok ? "done" : "failed");
      })
      .catch(() => {
        setResults([]);
        setFailure("writeFailed");
        setState("failed");
      });
  }, []);

  return {
    state,
    repositories,
    results,
    failure,
    writable: options.writable,
    run,
  };
}
