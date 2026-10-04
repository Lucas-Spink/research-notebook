import type {
  Arranged,
  BibliographyFileModel,
  IntegrityFinding,
} from "@research-notebook/format";
import { useCallback, useRef, useState } from "react";
import { runIntegrityCheck, type IntegrityApi } from "./model/collect";

/** What the panel shows: the last report and which findings were acknowledged. */
export type IntegrityModel = {
  state: "idle" | "running" | "done" | "failed";
  findings: readonly IntegrityFinding[];
  /** Keys of findings acknowledged this session. Not saved: the notebook holds no such record. */
  acknowledged: ReadonlySet<string>;
  run: () => void;
  setAcknowledged: (key: string, acknowledged: boolean) => void;
};

type Options = {
  api: IntegrityApi;
  folder: number;
  projectId: string | null;
  arranged: Arranged | null;
  bibliography: BibliographyFileModel;
};

/**
 * Runs the integrity check on request (FR-ARC-01). Acknowledgements are kept
 * in memory only (S6-T01): they survive running the check again, but a
 * finding that is gone takes its acknowledgement with it.
 */
export function useIntegrityCheck(options: Options): IntegrityModel {
  const [state, setState] = useState<IntegrityModel["state"]>("idle");
  const [findings, setFindings] = useState<readonly IntegrityFinding[]>([]);
  const [acknowledged, setAcknowledgedKeys] = useState<ReadonlySet<string>>(
    new Set(),
  );
  // The latest options, so `run` keeps one identity and still checks what is open now.
  const latest = useRef(options);
  latest.current = options;

  const run = useCallback(() => {
    const { api, folder, projectId, arranged, bibliography } = latest.current;
    if (projectId === null || arranged === null) return;
    setState("running");
    void runIntegrityCheck({
      api,
      folder,
      projectId,
      arranged,
      bibliography,
    })
      .then((result) => {
        if (!result.ok) {
          setState("failed");
          return;
        }
        setFindings(result.value);
        const keys = new Set(result.value.map((f) => f.key));
        setAcknowledgedKeys(
          (previous) => new Set([...previous].filter((k) => keys.has(k))),
        );
        setState("done");
      })
      .catch(() => setState("failed"));
  }, []);

  const setAcknowledged = useCallback((key: string, value: boolean) => {
    setAcknowledgedKeys((previous) => {
      const next = new Set(previous);
      if (value) next.add(key);
      else next.delete(key);
      return next;
    });
  }, []);

  return { state, findings, acknowledged, run, setAcknowledged };
}
