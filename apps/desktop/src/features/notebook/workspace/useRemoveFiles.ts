import type {
  ArtefactsFileModel,
  NotebookEnv,
  NotebookError,
  ReferenceIndex,
  Result,
} from "@research-notebook/format";
import { referencedIn } from "@research-notebook/format";
import { useState } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import type { ArtefactsOutcome } from "../model/api";
import {
  referenceCountText,
  removeOutcomeText,
} from "../table/evidenceMessages";
import { removeArtefactFiles, type BinApi } from "../table/model/binArtefact";

type Options = {
  api: BinApi;
  folder: FolderHandle;
  experimentFolder: string;
  /** The experiment's artefacts.yaml, or `null` when it could not be read. */
  file: ArtefactsFileModel | null;
  references: ReferenceIndex;
  /** Whether this experiment may be changed at all. */
  writable: boolean;
  editArtefacts: (
    experimentFolder: string,
    change: (
      file: ArtefactsFileModel,
      env: NotebookEnv,
    ) => Result<ArtefactsFileModel, NotebookError>,
  ) => Promise<ArtefactsOutcome>;
};

/**
 * Removing a file from an experiment (ADR-0062): the warning to show first,
 * counting the places that refer to it, and the removal itself, which moves
 * the file to the bin. Says what happened in `notes`. The steps are in
 * `table/model/binArtefact`.
 */
export function useRemoveFiles({
  api,
  folder,
  experimentFolder,
  file,
  references,
  writable,
  editArtefacts,
}: Options) {
  const [notes, setNotes] = useState<string[]>([]);

  async function removeFile(artefactId: string): Promise<boolean> {
    const artefact = file?.artefacts.find((a) => a.id === artefactId);
    if (!writable || artefact === undefined) return false;
    const outcome = await removeArtefactFiles({
      api,
      folder,
      experimentFolder,
      artefact,
      editArtefacts: (change) => editArtefacts(experimentFolder, change),
    });
    setNotes([removeOutcomeText(outcome)]);
    return outcome.kind === "removed";
  }

  function removeWarning(artefactId: string): string {
    return referenceCountText(referencedIn(references, artefactId).length);
  }

  return { removeFile, removeWarning, notes, dismiss: () => setNotes([]) };
}
