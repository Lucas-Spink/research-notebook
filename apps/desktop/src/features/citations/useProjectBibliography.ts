import type { CitationCluster } from "@research-notebook/format";
import { useCallback, useEffect, useRef } from "react";
import { commands, type FolderHandle } from "../../ipc/bindings";
import type { LiteratureRenderer } from "./model/literaturePlan";
import { workerRenderer } from "./model/literatureWorker";
import {
  formatProjectBibliography,
  type ProjectBibliography,
} from "./model/projectBibliography";
import { loadStyle, type StyleApi } from "./model/styleSource";
import { useSources } from "./SourcesContext";

type Options = {
  folder: FolderHandle;
  /** `project.yaml`'s `citation_style`; `null` before the project has loaded. */
  styleFile: string | null;
  /** Overridable for tests; defaults to the real IPC commands. */
  api?: StyleApi;
  /** Overridable for tests; defaults to the citeproc Web Worker. */
  render?: LiteratureRenderer;
};

/**
 * Formats the project's cited sources as one bibliography with the project's
 * style, from `bibliography.json` alone (FR-CIT-06, FR-ARC-06). The result is
 * a stable function, so it can be handed to the PDF export without causing
 * renders.
 */
export function useProjectBibliography({
  folder,
  styleFile,
  api = commands,
  render = workerRenderer,
}: Options): (
  clusters: readonly CitationCluster[],
) => Promise<ProjectBibliography | null> {
  const { items } = useSources();
  const latest = useRef({ items, folder, styleFile, api, render });
  useEffect(() => {
    latest.current = { items, folder, styleFile, api, render };
  });
  return useCallback(async (clusters) => {
    const current = latest.current;
    const style = await loadStyle(
      current.api,
      current.folder,
      current.styleFile,
    );
    return formatProjectBibliography(
      {
        render: current.render,
        items: current.items,
        styleXml: style.styleXml,
        localeXml: style.localeXml,
      },
      clusters,
    );
  }, []);
}
