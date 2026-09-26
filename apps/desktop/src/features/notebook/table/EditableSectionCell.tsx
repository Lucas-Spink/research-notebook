import type {
  ArtefactsFileModel,
  RecognisedSectionKey,
  ReferenceIndex,
  SummaryPart,
} from "@research-notebook/format";
import { useState } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import { commands } from "../../../ipc/bindings";
import { isLiveIn, liveKey, sectionText } from "../editing/model/liveEditor";
import type { LiveEditor } from "../editing/useLiveEditor";
import { ReferencePreviewOverlay } from "../expanded/ReferencePreviewOverlay";
import { RichSectionEditor } from "../expanded/RichSectionEditor";
import { columnLabel, editLabel } from "../messages";
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
};

type Props = {
  row: ExperimentRow;
  section: RecognisedSectionKey;
  parts: readonly SummaryPart[];
  artefacts: ArtefactsFileModel | null;
  folder: FolderHandle;
  editing: TableEditing;
  /** Whether this cell holds the grid's one tab stop (ADR-0043 point 5). */
  tabbable: boolean;
};

/** Keys that open a focused section for editing (FR-TBL-11). */
const OPEN_KEYS = new Set(["Enter", " ", "F2"]);

/** A reference chip's activation (FR-EDT-06), waiting to open its preview. */
type OpenReference = { ulid: string; version: number | null };

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
  folder,
  editing,
  tabbable,
}: Props) {
  const [openReference, setOpenReference] = useState<OpenReference | null>(
    null,
  );
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
      onActivateReference={(ulid, version) =>
        setOpenReference({ ulid, version })
      }
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

  return (
    <>
      {content}
      {openReference !== null &&
        artefacts !== null &&
        editing.projectId !== null && (
          <ReferencePreviewOverlay
            api={commands}
            folder={folder}
            projectId={editing.projectId}
            experimentFolder={experiment.folder}
            file={artefacts}
            artefactId={openReference.ulid}
            version={openReference.version}
            references={editing.references}
            onClose={() => setOpenReference(null)}
          />
        )}
    </>
  );
}
