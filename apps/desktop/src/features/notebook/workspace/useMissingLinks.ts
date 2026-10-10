import type { ArtefactsFileModel } from "@research-notebook/format";
import { useEffect, useMemo, useState } from "react";
import type { FolderHandle, commands } from "../../../ipc/bindings";

/** The command a live check of linked files needs (FR-EVD-07). */
export type LinkCheckApi = Pick<typeof commands, "linkedArtefactAvailability">;

/** The linked results of `file`: where each one is recorded, to be checked now. */
export function linkedResults(file: ArtefactsFileModel) {
  return file.artefacts.flatMap((artefact) =>
    artefact.mode === "link" && artefact.role === "result"
      ? [{ artefactId: artefact.id, ...artefact.source }]
      : [],
  );
}

/**
 * The linked results whose file cannot be found now (issue #101, section
 * 5.7): checked live and never stored (ADR-0031 point 1), once for each
 * change to the set of linked files. A check that cannot run is not shown as
 * missing, because that would be a claim nothing supports. Nothing is written.
 */
export function useMissingLinks(
  api: LinkCheckApi,
  folder: FolderHandle,
  projectId: string | null,
  file: ArtefactsFileModel | null,
): ReadonlySet<string> {
  const links = useMemo(
    () => (file === null ? [] : linkedResults(file)),
    [file],
  );
  const signature = JSON.stringify(links);
  const [missing, setMissing] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    if (projectId === null || links.length === 0) {
      setMissing(new Set());
      return;
    }
    let current = true;
    void Promise.all(
      links.map(async ({ artefactId, root, path }) => {
        const found = await api
          .linkedArtefactAvailability(folder, projectId, root, path)
          .catch(() => null);
        return found?.status === "ok" && found.data.kind !== "available"
          ? artefactId
          : null;
      }),
    ).then((ids) => {
      if (current) setMissing(new Set(ids.filter((id) => id !== null)));
    });
    return () => {
      current = false;
    };
    // `signature` stands for `links`, which is rebuilt on every parse of the file.
  }, [api, folder, projectId, signature]);

  return missing;
}
