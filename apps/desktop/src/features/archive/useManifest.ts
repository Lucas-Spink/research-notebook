import type { Arranged } from "@research-notebook/format";
import { useCallback, useRef, useState } from "react";
import {
  generateManifest,
  type ManifestApi,
  type ManifestFailure,
  type ManifestOutcome,
} from "./model/generate";

/** What the manifest panel shows: the last attempt and how it ended. */
export type ManifestModel = {
  state: "idle" | "running" | "done" | "failed";
  outcome: ManifestOutcome | null;
  failure: ManifestFailure | null;
  /** Whether this application may write the project; the manifest is a file in it. */
  writable: boolean;
  run: () => void;
};

type Options = {
  api: ManifestApi;
  folder: number;
  arranged: Arranged | null;
  writable: boolean;
};

/** Generates the manifest on request (FR-ARC-02). Never runs by itself. */
export function useManifest(options: Options): ManifestModel {
  const [state, setState] = useState<ManifestModel["state"]>("idle");
  const [outcome, setOutcome] = useState<ManifestOutcome | null>(null);
  const [failure, setFailure] = useState<ManifestFailure | null>(null);
  // The latest options, so `run` keeps one identity and uses what is open now.
  const latest = useRef(options);
  latest.current = options;

  const run = useCallback(() => {
    const { api, folder, arranged, writable } = latest.current;
    if (arranged === null || !writable) return;
    setState("running");
    void generateManifest({ api, folder, arranged })
      .then((result) => {
        if (result.ok) {
          setOutcome(result.value);
          setFailure(null);
          setState("done");
        } else {
          setOutcome(null);
          setFailure(result.error);
          setState("failed");
        }
      })
      .catch(() => {
        setOutcome(null);
        setFailure("writeFailed");
        setState("failed");
      });
  }, []);

  return { state, outcome, failure, writable: options.writable, run };
}
