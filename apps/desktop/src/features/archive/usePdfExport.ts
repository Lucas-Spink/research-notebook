import type { Arranged, ProjectYamlModel } from "@research-notebook/format";
import { useCallback, useRef, useState } from "react";
import {
  exportPdf,
  type FormatBibliography,
  type PdfExportApi,
  type PdfExportFailure,
  type PdfExportOutcome,
} from "./model/pdfExport";

/** What the PDF export panel shows: the last attempt and how it ended. */
export type PdfExportModel = {
  state: "idle" | "running" | "done" | "failed";
  outcome: PdfExportOutcome | null;
  failure: PdfExportFailure | null;
  /** Whether this application may write the project; the export is a file in it. */
  writable: boolean;
  /** Whether the project has loaded, so there is something to export. */
  ready: boolean;
  run: () => void;
};

type Options = {
  api: PdfExportApi;
  folder: number;
  arranged: Arranged | null;
  /** `project.yaml` as parsed; `null` before the project has loaded. */
  project: ProjectYamlModel | null;
  writable: boolean;
  formatBibliography: FormatBibliography;
  now: () => Date;
};

/** Writes the project PDF/A-3b on request (FR-ARC-06). Never runs by itself. */
export function usePdfExport(options: Options): PdfExportModel {
  const [state, setState] = useState<PdfExportModel["state"]>("idle");
  const [outcome, setOutcome] = useState<PdfExportOutcome | null>(null);
  const [failure, setFailure] = useState<PdfExportFailure | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const run = useCallback(() => {
    const { arranged, project, writable, ...rest } = latest.current;
    if (arranged === null || project === null || !writable) return;
    setState("running");
    void exportPdf({ ...rest, arranged, project })
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
