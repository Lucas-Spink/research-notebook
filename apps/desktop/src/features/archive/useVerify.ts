import type { Arranged } from "@research-notebook/format";
import { useCallback, useRef, useState } from "react";
import {
  verifyManifest,
  type VerifyApi,
  type VerifyFailure,
  type VerifyOutcome,
} from "./model/verify";

/** What the Verify panel shows: the last run and how it ended. */
export type VerifyModel = {
  state: "idle" | "running" | "done" | "failed";
  outcome: VerifyOutcome | null;
  failure: VerifyFailure | null;
  run: () => void;
};

type Options = { api: VerifyApi; folder: number; arranged: Arranged | null };

/** Verifies on request (FR-ARC-03). Reads only, so it works on a read-only project. */
export function useVerify(options: Options): VerifyModel {
  const [state, setState] = useState<VerifyModel["state"]>("idle");
  const [outcome, setOutcome] = useState<VerifyOutcome | null>(null);
  const [failure, setFailure] = useState<VerifyFailure | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const run = useCallback(() => {
    const { api, folder, arranged } = latest.current;
    if (arranged === null) return;
    setState("running");
    void verifyManifest({ api, folder, arranged })
      .then((result) => {
        setOutcome(result.ok ? result.value : null);
        setFailure(result.ok ? null : result.error);
        setState(result.ok ? "done" : "failed");
      })
      .catch(() => {
        setOutcome(null);
        setFailure("filesNotChecked");
        setState("failed");
      });
  }, []);

  return { state, outcome, failure, run };
}
