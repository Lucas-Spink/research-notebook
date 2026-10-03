import type { Arranged } from "@research-notebook/format";
import { useRef } from "react";
import { commands, type FolderHandle } from "../../../ipc/bindings";
import { evidenceOf } from "../model/evidence";
import { AddFilesBar } from "../table/AddFilesBar";
import { evidenceDrops } from "../table/dropsApi";
import type { TableEditing } from "../table/EditableSectionCell";
import { addResultMessages as m } from "./messages";
import "./AddResultPane.css";
import type { PaneTab } from "./model/panes";

type Props = {
  tab: Extract<PaneTab, { kind: "addResult" }>;
  arranged: Arranged;
  folder: FolderHandle;
  editing: TableEditing;
};

/**
 * Everything for adding results to one experiment, in the side pane (S6-T01)
 * instead of crowding its table cell: choose files, find files in a folder,
 * pick whether each is copied or linked, or drop files anywhere on the pane.
 * It is opened by the plus in the experiment's Results cell.
 */
export function AddResultPane({ tab, arranged, folder, editing }: Props) {
  const zone = useRef<HTMLDivElement>(null);
  const item = [
    ...arranged.questions.flatMap((group) => group.experiments),
    ...arranged.unassigned,
  ].find((candidate) => candidate.experiment.folder === tab.experimentFolder);
  const artefacts = item === undefined ? null : evidenceOf(item);
  const front = item?.experiment.file.frontmatter;
  const readOnly =
    !editing.writable ||
    item === undefined ||
    item.readOnly ||
    artefacts === null;

  return (
    <div ref={zone} className="add-result">
      <h3 className="add-result__heading">
        {front === undefined ? "" : m.heading(front.ref)}
      </h3>
      {front !== undefined && (
        <p className="add-result__title">{front.title}</p>
      )}
      <p className="add-result__intro">{m.intro}</p>
      {artefacts !== null &&
      editing.evidence !== null &&
      editing.projectId !== null ? (
        <AddFilesBar
          pane
          api={commands}
          folder={folder}
          projectId={editing.projectId}
          experimentFolder={tab.experimentFolder}
          evidence={editing.evidence}
          artefacts={artefacts}
          editArtefacts={editing.editArtefacts}
          readOnly={readOnly}
          zone={zone}
          drops={evidenceDrops}
        />
      ) : (
        <p>{m.unavailable}</p>
      )}
    </div>
  );
}
