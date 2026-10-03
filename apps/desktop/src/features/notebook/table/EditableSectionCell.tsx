import type {
  ArtefactsFileModel,
  ExperimentChanges,
  RecognisedSectionKey,
  ReferenceIndex,
  CellPart,
} from "@research-notebook/format";
import { isLiveIn, liveKey, sectionText } from "../editing/model/liveEditor";
import type { LiveEditor } from "../editing/useLiveEditor";
import { RichSectionEditor } from "../expanded/RichSectionEditor";
import { columnLabel, editLabel } from "../messages";
import type { NotebookActions } from "../useNotebook";
import type { EvidenceProject } from "./model/addEvidence";
import type { ExperimentRow } from "./model/rows";
import { SummaryCell } from "./SummaryCell";

/** What the table needs to edit sections in place (ADR-0043). */
export type TableEditing = {
  /** The application's one live section editor. */
  live: LiveEditor;
  /** Whether the project may be written to at all (spec 5.11). */
  writable: boolean;
  /** `project.yaml`'s own id, for a reference chip's preview; `null` before the project has loaded. */
  projectId: string | null;
  /** Every reference across the project, for a preview's "Referenced in" list (FR-SRC-03). */
  references: ReferenceIndex;
  /** Opens this row's section for editing in its cell. */
  onEdit: (row: ExperimentRow, section: RecognisedSectionKey) => void;
  /** Saves an experiment's title or status (FR-EXP-05). Resolves whether it was saved. */
  onEditExperiment: (
    id: string,
    changes: ExperimentChanges,
  ) => Promise<boolean>;
  /** Opens this row's Results browser in the side pane, after any live section editor has saved and closed. */
  onOpenResults: (row: ExperimentRow) => void;
  /** Opens the Add result pane for this row's experiment, and selects the row. */
  onAddResult: (row: ExperimentRow) => void;
  /** Opens one result in the side pane: its experiment's folder, the artefact and the version to show (`null` for the latest or a linked file). */
  onOpenResult: (
    experimentFolder: string,
    artefactId: string,
    version: number | null,
  ) => void;
  /** What adding a file needs from `project.yaml`, or `null` before it has loaded. */
  evidence: EvidenceProject | null;
  /** Changes one experiment's artefacts.yaml, as `useNotebook` does. */
  editArtefacts: NotebookActions["editArtefacts"];
};

type Props = {
  row: ExperimentRow;
  section: RecognisedSectionKey;
  parts: readonly CellPart[];
  artefacts: ArtefactsFileModel | null;
  editing: TableEditing;
  /** Whether this cell holds the grid's one tab stop (ADR-0043 point 5). */
  tabbable: boolean;
};

/** Keys that open a focused section for editing (FR-TBL-11). */
const OPEN_KEYS = new Set(["Enter", " ", "F2"]);

/**
 * A Methods, Results Notes or Interpretation cell (FR-TBL-11). While it is
 * the application's live section on the table surface it holds the rich
 * editor, with the caret in it; otherwise it shows the line-clamped summary
 * (FR-TBL-05), which a click, Enter, Space or F2 opens for editing. A
 * read-only project, or an experiment left read-only (spec P6, AGENTS.md
 * rule 5), only shows the summary.
 */
export function EditableSectionCell({
  row,
  section,
  parts,
  artefacts,
  editing,
  tabbable,
}: Props) {
  const { experiment } = row.item;
  const label = columnLabel(section);
  const live = isLiveIn(
    editing.live.target,
    experiment.folder,
    section,
    "table",
  );

  const content = live ? (
    <RichSectionEditor
      label={label}
      editorKey={liveKey({
        folder: experiment.folder,
        section,
        surface: "table",
      })}
      initialMarkdown={sectionText(experiment, section)}
      field={editing.live.field}
      disabled={!editing.writable}
      live
      onActivate={() => undefined}
      artefacts={artefacts}
      // A figure reference opens that result in the side pane, never full size.
      onActivateReference={(ulid, version) =>
        editing.onOpenResult(experiment.folder, ulid, version)
      }
      // FR-CIT-09: Methods, then Interpretation; never Results Notes.
      allowCitations={section !== "results_notes"}
      autoFocus
    />
  ) : !editing.writable || row.item.readOnly ? (
    <SummaryCell parts={parts} artefacts={artefacts} />
  ) : (
    <div
      role="button"
      tabIndex={tabbable ? 0 : -1}
      data-grid-focus
      className="wtable__edit"
      aria-label={editLabel(label)}
      onClick={() => editing.onEdit(row, section)}
      onKeyDown={(event) => {
        if (OPEN_KEYS.has(event.key)) {
          event.preventDefault();
          editing.onEdit(row, section);
        }
      }}
    >
      <SummaryCell parts={parts} artefacts={artefacts} />
    </div>
  );

  return content;
}
