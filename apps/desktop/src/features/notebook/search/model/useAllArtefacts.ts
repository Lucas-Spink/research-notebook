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

/** How many files are read at once, matching `model/load.ts`. */
const AT_ONCE = 16;

async function inGroups<T, R>(
  items: readonly T[],
  each: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += AT_ONCE) {
    const group = items.slice(start, start + AT_ONCE);
    results.push(...(await Promise.all(group.map(each))));
  }
  return results;
}

/**
 * Every listed experiment folder's `artefacts.yaml`, read once when
 * `enabled` turns on (search is opened), for the artefact name and filename
 * fields of FR-SRC-01. A read or parse failure just leaves that experiment's
 * artefacts out of the results, the same as `useExperimentArtefacts`.
 */
export function useAllArtefacts(
  api: ReadApi,
  folder: FolderHandle,
  experimentFolders: readonly string[],
  enabled: boolean,
): ReadonlyMap<string, ArtefactsFileModel> {
  const [byFolder, setByFolder] = useState<
    ReadonlyMap<string, ArtefactsFileModel>
  >(new Map());
  const key = experimentFolders.join(",");

  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    void inGroups(experimentFolders, async (expFolder) => {
      const result = await api
        .readNotebookFile(folder, artefactsPath(expFolder))
        .catch(() => null);
      if (result === null || result.status === "error") return null;
      if (result.data.kind !== "text") return null;
      const parsed = parseArtefacts(result.data.text);
      return parsed.ok ? ([expFolder, parsed.value] as const) : null;
    }).then((read) => {
      if (stale) return;
      const found = read.filter(
        (entry): entry is readonly [string, ArtefactsFileModel] =>
          entry !== null,
      );
      setByFolder(new Map(found));
    });
    return () => {
      stale = true;
    };
    // `key` stands in for `experimentFolders`, whose array identity changes every render.
  }, [api, folder, enabled, key]);

  return byFolder;
}
