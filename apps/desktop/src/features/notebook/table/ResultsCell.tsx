import type { ArtefactsFileModel } from "@research-notebook/format";
import { useRef } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import {
  addResultLabel,
  browseResultsLabel,
  resultsCountLabel,
  tableMessages,
} from "../messages";
import type { TableEditing } from "./EditableSectionCell";
import type { ExperimentRow } from "./model/rows";
import { previewVersion } from "./model/resultVersion";
import { resultsSummary } from "./model/resultsSummary";
import { ResultThumb } from "./ResultThumb";

type Props = {
  row: ExperimentRow;
  /** The experiment's artefacts.yaml, or `null` when it could not be read. */
  artefacts: ArtefactsFileModel | null;
  folder: FolderHandle;
  editing: TableEditing;
  /** Whether this cell holds the grid's one tab stop (ADR-0043 point 5). */
  tabbable: boolean;
};

/** Keys that open a focused Results cell, as they open a section. */
const OPEN_KEYS = new Set(["Enter", " ", "F2"]);

/**
 * The Results cell (FR-TBL-06): how many results there are, by group, and the
 * first few as files, each with its name and a small icon for its type.
 * Hovering one shows it larger, and double-clicking opens it in the side
 * pane. Clicking the cell, or Enter, Space or F2, opens the experiment's
 * Results browser in the pane, where files are organised into folders, and
 * the plus adds more. A read-only project or experiment can browse its
 * results but change nothing.
 */
export function ResultsCell({
  row,
  artefacts,
  folder,
  editing,
  tabbable,
}: Props) {
  const { experiment } = row.item;
  const ref = experiment.file.frontmatter.ref;
  const readOnly = !editing.writable || row.item.readOnly || artefacts === null;
  const control = useRef<HTMLDivElement>(null);

  const openResult = (artefactId: string) =>
    artefacts === null
      ? undefined
      : editing.onOpenResult(
          experiment.folder,
          artefactId,
          previewVersion(artefacts, artefactId),
        );

  const summary = artefacts === null ? null : resultsSummary(artefacts);
  return (
    <div className="wtable__results-wrap">
      <div
        ref={control}
        role="button"
        tabIndex={tabbable ? 0 : -1}
        data-grid-focus
        className="wtable__edit wtable__results"
        aria-label={browseResultsLabel(ref)}
        onClick={() => editing.onOpenResults(row)}
        onKeyDown={(event) => {
          if (OPEN_KEYS.has(event.key)) {
            event.preventDefault();
            editing.onOpenResults(row);
          } else if (event.key === "+" && !readOnly) {
            event.preventDefault();
            editing.onAddResult(row);
          }
        }}
      >
        {summary === null || summary.total === 0 ? (
          <span className="wtable__muted">{tableMessages.resultsNone}</span>
        ) : (
          <>
            <div className="wtable__results-counts">
              {resultsCountLabel(summary.total)}
              {summary.groups.map((group, index) => (
                // Two top-level groups may share a name.
                <span key={index} className="wtable__results-group">
                  {group.name} {group.count}
                </span>
              ))}
            </div>
            <div className="wtable__thumbs">
              {summary.thumbnails.map((thumb) => (
                <ResultThumb
                  key={thumb.artefactId}
                  folder={folder}
                  experimentFolder={experiment.folder}
                  thumb={thumb}
                  onOpen={() => openResult(thumb.artefactId)}
                />
              ))}
            </div>
            <span className="wtable__browse">{tableMessages.browseAll}</span>
          </>
        )}
      </div>
      {!readOnly && (
        <button
          type="button"
          className="wtable__add-result"
          // The grid has one tab stop per cell (ADR-0043): by keyboard, press + in the cell.
          tabIndex={-1}
          aria-label={addResultLabel(ref)}
          title={addResultLabel(ref)}
          onClick={(event) => {
            event.stopPropagation();
            editing.onAddResult(row);
          }}
        >
          <span aria-hidden="true">+</span>
        </button>
      )}
    </div>
  );
}
