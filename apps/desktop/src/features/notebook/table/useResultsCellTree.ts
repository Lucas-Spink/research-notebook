import type { ArtefactsFileModel } from "@research-notebook/format";
import {
  applyGroupAction,
  type ActionOutcome,
  type GroupAction,
} from "../../results";
import { commands, type FolderHandle } from "../../../ipc/bindings";
import { useMissingLinks } from "../workspace/useMissingLinks";
import { useRemoveFiles } from "../workspace/useRemoveFiles";
import { useResultFileActions } from "../workspace/useResultFileActions";
import type { TableEditing } from "./EditableSectionCell";
import { previewVersion } from "./model/resultVersion";

/**
 * What the Results tree inside one Results cell needs (issue #101): saving a
 * change to this experiment's `artefacts.yaml`, opening a result's preview,
 * opening its file outside the application, and which linked files are
 * missing. Everything goes through the same paths the side pane used.
 */
export function useResultsCellTree(
  folder: FolderHandle,
  experimentFolder: string,
  file: ArtefactsFileModel | null,
  editing: TableEditing,
) {
  const missing = useMissingLinks(commands, folder, editing.projectId, file);
  const fileAction = useResultFileActions(
    commands,
    folder,
    editing.projectId,
    experimentFolder,
    file,
  );

  const removal = useRemoveFiles({
    api: commands,
    folder,
    experimentFolder,
    file,
    references: editing.references,
    writable: editing.writable,
    editArtefacts: editing.editArtefacts,
  });

  async function onAction(action: GroupAction): Promise<ActionOutcome> {
    const outcome = await editing.editArtefacts(
      experimentFolder,
      (current, env) => applyGroupAction(current, action, env),
    );
    // A save that failed for another reason is already in the notice.
    return outcome.ok || outcome.error === null
      ? { ok: true }
      : { ok: false, error: outcome.error };
  }

  const onOpen = (artefactId: string) => {
    if (file === null) return;
    editing.onOpenResult(
      experimentFolder,
      artefactId,
      previewVersion(file, artefactId),
    );
  };

  return {
    missing,
    onFileAction: fileAction,
    onAction,
    onOpen,
    onRemoveFile: removal.removeFile,
    removeWarning: removal.removeWarning,
    removalNotes: removal.notes,
  };
}
