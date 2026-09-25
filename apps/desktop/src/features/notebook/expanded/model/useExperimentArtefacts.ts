import {
  parseArtefacts,
  type ArtefactsFileModel,
} from "@research-notebook/format";
import { useEffect, useState } from "react";
import type { FolderHandle } from "../../../../ipc/bindings";
import type { ReadApi } from "../../model/api";

/** `_notebook/experiments/<folder>/artefacts.yaml`. */
function artefactsPath(experimentFolder: string): string {
  return `_notebook/experiments/${experimentFolder}/artefacts.yaml`;
}

/**
 * An experiment's `artefacts.yaml`, read fresh whenever the experiment
 * changes, for the @ autocomplete's search list (FR-EDT-04). Nothing here
 * writes, and a read failure — missing file, unreadable, invalid — is
 * indistinguishable from "still loading": the autocomplete just has nothing
 * to show yet, the same as any other search with no results.
 */
export function useExperimentArtefacts(
  api: ReadApi,
  folder: FolderHandle,
  experimentFolder: string,
): ArtefactsFileModel | null {
  const [file, setFile] = useState<ArtefactsFileModel | null>(null);

  useEffect(() => {
    let stale = false;
    setFile(null);
    void api
      .readNotebookFile(folder, artefactsPath(experimentFolder))
      .then((result) => {
        if (stale) return;
        if (result.status === "error" || result.data.kind !== "text") return;
        const parsed = parseArtefacts(result.data.text);
        if (parsed.ok) setFile(parsed.value);
      })
      .catch(() => undefined);
    return () => {
      stale = true;
    };
  }, [api, folder, experimentFolder]);

  return file;
}
