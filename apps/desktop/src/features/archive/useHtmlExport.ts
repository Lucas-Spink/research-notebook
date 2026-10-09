import type { Arranged } from "@research-notebook/format";
import { useCallback, useRef, useState } from "react";
import {
  exportHtml,
  type HtmlExportApi,
  type HtmlExportFailure,
  type HtmlExportOutcome,
} from "./model/htmlExport";

/** What the HTML export panel shows: the last attempt and how it ended. */
export type HtmlExportModel = {
  state: "idle" | "running" | "done" | "failed";
  outcome: HtmlExportOutcome | null;
  failure: HtmlExportFailure | null;
  /** Whether this application may write the project; the export is files in it. */
  writable: boolean;
  /** Whether the project has loaded, so there is something to export. */
  ready: boolean;
  run: () => void;
};

type Options = {
  api: HtmlExportApi;
  folder: number;
  arranged: Arranged | null;
  /** `project.yaml`'s name and locale; `null` before the project has loaded. */
  project: { name: string; locale: string } | null;
  writable: boolean;
};

/** Writes the static HTML export on request (FR-ARC-05). Never runs by itself. */
export function useHtmlExport(options: Options): HtmlExportModel {
  const [state, setState] = useState<HtmlExportModel["state"]>("idle");
  const [outcome, setOutcome] = useState<HtmlExportOutcome | null>(null);
  const [failure, setFailure] = useState<HtmlExportFailure | null>(null);
  const latest = useRef(options);
  latest.current = options;

  const run = useCallback(() => {
    const { api, folder, arranged, project, writable } = latest.current;
    if (arranged === null || project === null || !writable) return;
    setState("running");
    void exportHtml({
      api,
      folder,
      arranged,
      projectName: project.name,
      locale: project.locale,
    })
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
