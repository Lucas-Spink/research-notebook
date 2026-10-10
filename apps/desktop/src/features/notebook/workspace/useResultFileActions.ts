import type { ArtefactsFileModel } from "@research-notebook/format";
import { useCallback } from "react";
import type { FolderHandle, commands } from "../../../ipc/bindings";
import { versionPath } from "../../preview";

/** The commands that open a result's file outside the application. */
export type FileActionApi = Pick<
  typeof commands,
  "openCapturedFileAction" | "openLinkedFileAction"
>;

/** What the person asked to do with the file itself. */
export type ResultFileAction = "openFile" | "reveal";

/**
 * Opens a result's file in its default application, or shows it in the file
 * manager (issue #101, section 5.6). A copied result opens its captured copy
 * inside `_notebook/`; a linked result opens the file where it lives. This
 * reads and launches only: it never writes, moves or renames the file.
 * Resolves to `null` on success, or `false` when it could not be done, so
 * the tree can say so.
 */
export function useResultFileActions(
  api: FileActionApi,
  folder: FolderHandle,
  projectId: string | null,
  experimentFolder: string,
  file: ArtefactsFileModel | null,
) {
  return useCallback(
    async (artefactId: string, action: ResultFileAction): Promise<boolean> => {
      const artefact = file?.artefacts.find((a) => a.id === artefactId);
      if (artefact === undefined) return false;
      const result = await (async () => {
        if (artefact.mode === "link") {
          if (projectId === null) return null;
          return api.openLinkedFileAction(
            folder,
            projectId,
            artefact.source.root,
            artefact.source.path,
            action,
          );
        }
        const latest = artefact.versions.at(-1);
        if (latest === undefined) return null;
        return api.openCapturedFileAction(
          folder,
          versionPath(experimentFolder, latest.file),
          action,
        );
      })().catch(() => null);
      return result?.status === "ok";
    },
    [api, folder, projectId, experimentFolder, file],
  );
}
