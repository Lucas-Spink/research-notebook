import type { Arranged, ReferenceIndex } from "@research-notebook/format";
import { commands, type FolderHandle } from "../../../ipc/bindings";
import { PreviewPanel } from "../../preview-panel";
import { evidenceOf } from "../model/evidence";
import type { TableEditing } from "../table/EditableSectionCell";
import { paneMessages } from "./messages";
import type { PaneTab } from "./model/panes";

type Props = {
  tab: Extract<PaneTab, { kind: "result" }>;
  arranged: Arranged;
  folder: FolderHandle;
  projectId: string | null;
  references: ReferenceIndex;
  editing: TableEditing;
  readOnly: boolean;
};

/** The experiment with this folder, wherever it sits in the arrangement. */
function findExperiment(arranged: Arranged, experimentFolder: string) {
  return [
    ...arranged.questions.flatMap((q) => q.experiments),
    ...arranged.unassigned,
  ].find((item) => item.experiment.folder === experimentFolder);
}

/**
 * One result in the side pane (S6-T01): the figure at a useful size with
 * zoom and pan, its name and its metadata, which the preview panel already
 * shows. The table stays beside it.
 */
export function ResultPane({
  tab,
  arranged,
  folder,
  projectId,
  references,
  editing,
  readOnly,
}: Props) {
  const item = findExperiment(arranged, tab.experimentFolder);
  const file = item === undefined ? null : evidenceOf(item);
  if (
    file === null ||
    projectId === null ||
    !file.artefacts.some((a) => a.id === tab.artefactId)
  ) {
    return <p>{paneMessages.resultUnavailable}</p>;
  }
  return (
    <PreviewPanel
      api={commands}
      folder={folder}
      projectId={projectId}
      experimentFolder={tab.experimentFolder}
      file={file}
      artefactId={tab.artefactId}
      version={tab.version}
      references={references}
      {...(editing.evidence === null || readOnly
        ? {}
        : {
            relink: {
              editArtefacts: editing.editArtefacts,
              externalRoots: editing.evidence.externalRoots,
            },
          })}
    />
  );
}
