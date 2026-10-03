import type {
  RecognisedSectionKey,
  ReferenceIndex,
} from "@research-notebook/format";
import { useState } from "react";
import type { LiveEditor } from "../editing/useLiveEditor";
import type { NotebookActions } from "../useNotebook";
import type { TableEditing } from "./EditableSectionCell";
import type { EvidenceProject } from "./model/addEvidence";
import type { ExperimentRow } from "./model/rows";

type Options = {
  live: LiveEditor;
  writable: boolean;
  projectId: string | null;
  references: ReferenceIndex;
  evidence: EvidenceProject | null;
  actions: NotebookActions;
  /** Selects a row, as clicking its title does. */
  onSelectRow: (row: ExperimentRow) => void;
  /** Opens a result in the side pane. */
  onOpenResult: TableEditing["onOpenResult"];
  /** Opens the Add result pane for an experiment's folder. */
  onOpenAddResult: (experimentFolder: string) => void;
};

/**
 * Everything the table needs to edit in place (ADR-0043, ADR-0044): one
 * thing open at a time, a section being edited in its cell or a Results
 * cell. Either opens only once whatever was open has saved and closed, and
 * then selects its row, so a failed save is never left open out of sight.
 */
export function useTableEditing({
  live,
  writable,
  projectId,
  references,
  evidence,
  actions,
  onSelectRow,
  onOpenResult,
  onOpenAddResult,
}: Options): TableEditing {
  const [openResults, setOpenResults] = useState<string | null>(null);

  function onEdit(row: ExperimentRow, section: RecognisedSectionKey) {
    const folder = row.item.experiment.folder;
    void live.activate({ folder, section, surface: "table" }).then((opened) => {
      if (!opened) return;
      setOpenResults(null);
      onSelectRow(row);
    });
  }

  function onOpenResults(row: ExperimentRow) {
    void live.activate(null).then((closed) => {
      if (!closed) return;
      setOpenResults(row.item.experiment.folder);
      onSelectRow(row);
    });
  }

  function onAddResult(row: ExperimentRow) {
    onSelectRow(row);
    onOpenAddResult(row.item.experiment.folder);
  }

  return {
    live,
    writable,
    projectId,
    references,
    onEdit,
    onEditExperiment: (id, changes) => actions.editExperiment(id, changes),
    openResults,
    onOpenResults,
    onCloseResults: () => setOpenResults(null),
    onOpenResult,
    onAddResult,
    evidence,
    editArtefacts: (folder, change) => actions.editArtefacts(folder, change),
  };
}
