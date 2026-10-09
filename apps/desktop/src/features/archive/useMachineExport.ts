import type { Arranged, ProjectYamlModel } from "@research-notebook/format";
import { useCallback, useRef, useState } from "react";
import {
  exportMachine,
  type MachineExportApi,
  type MachineExportFailure,
  type MachineExportOutcome,
} from "./model/machineExport";

/** What the machine-readable export panel shows: the last attempt and how it ended. */
export type MachineExportModel = {
  state: "idle" | "running" | "done" | "failed";
  outcome: MachineExportOutcome | null;
  failure: MachineExportFailure | null;
  /** Whether this application may write the project; the export is files in it. */
  writable: boolean;
  /** Whether the project has loaded, so there is something to export. */
  ready: boolean;
  run: () => void;
};

type Options = {
  api: MachineExportApi;
  folder: number;
  arranged: Arranged | null;
  /** `project.yaml` as parsed; `null` before the project has loaded. */
  project: ProjectYamlModel | null;
  writable: boolean;
  now: () => Date;
};

/** Writes the machine-readable export on request (FR-ARC-07). Never runs by itself. */
export function useMachineExport(options: Options): MachineExportModel {
  const [state, setState] = useState<MachineExportModel["state"]>("idle");
  const [outcome, setOutcome] = useState<MachineExportOutcome | null>(null);
  const [failure, setFailure] = useState<MachineExportFailure | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const run = useCallback(() => {
    const { api, folder, arranged, project, writable, now } = latest.current;
    if (arranged === null || project === null || !writable) return;
    setState("running");
    void exportMachine({ api, folder, arranged, project, now })
      .then((result) => {
        setOutcome(result.ok ? result.value : null);
        setFailure(result.ok ? null : result.error);
        setState(result.ok ? "done" : "failed");
      })
      .catch(() => {
        setOutcome(null);
        setFailure("writeFailed");
        setState("failed");
      });
  }, []);

  return {
    state,
    outcome,
    failure,
    writable: options.writable,
    ready: options.arranged !== null && options.project !== null,
    run,
  };
}
