import type { ArtefactsFileModel } from "@research-notebook/format";
import { useEffect, useRef } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import {
  applyGroupAction,
  ResultsTree,
  type ActionOutcome,
  type GroupAction,
} from "../../results";
import {
  addResultLabel,
  browseResultsLabel,
  resultsCountLabel,
  tableMessages,
} from "../messages";
import type { TableEditing } from "./EditableSectionCell";
import type { ExperimentRow } from "./model/rows";
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

/** The version a result opens at: a copy's latest, or `null` for a linked file. */
function previewVersion(file: ArtefactsFileModel, artefactId: string) {
  const artefact = file.artefacts.find((a) => a.id === artefactId);
  if (artefact === undefined || artefact.mode !== "copy") return null;
  return Math.max(...artefact.versions.map((v) => v.v));
}

/**
 * The Results cell (FR-TBL-06, ADR-0044 point 4). Closed, it shows how
 * many results there are, by group, with up to four thumbnails, and opens
 * on click, Enter, Space or F2. Open, the row grows around the experiment's
 * folder tree: groups as folders to make, nest, rename and delete, and
 * files to move, add to more folders and preview. Escape or Close closes it
 * and returns focus here. A read-only project or experiment can browse it
 * but change nothing.
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
  const open = editing.openResults === experiment.folder;
  const readOnly = !editing.writable || row.item.readOnly || artefacts === null;
  const control = useRef<HTMLDivElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (!open && returnFocus.current) {
      returnFocus.current = false;
      control.current?.focus();
    }
  }, [open]);

  function close() {
    returnFocus.current = true;
    editing.onCloseResults();
  }

  async function onAction(action: GroupAction): Promise<ActionOutcome> {
    const outcome = await editing.editArtefacts(
      experiment.folder,
      (file, env) => applyGroupAction(file, action, env),
    );
    // A save that failed for another reason is already in the notice.
    return outcome.ok || outcome.error === null
      ? { ok: true }
      : { ok: false, error: outcome.error };
  }

  const openResult = (artefactId: string) =>
    artefacts === null
      ? undefined
      : editing.onOpenResult(
          experiment.folder,
          artefactId,
          previewVersion(artefacts, artefactId),
        );

  if (open) {
    return (
      <div
        className="wtable__results-open"
        onKeyDown={(event) => {
          const inPanel =
            event.target instanceof Element &&
            event.target.closest(".results__panel") !== null;
          if (event.key === "Escape" && !event.defaultPrevented && !inPanel) {
            event.preventDefault();
            close();
          }
        }}
      >
        <div className="wtable__results-tools">
          {!readOnly && (
            <button
              type="button"
              className="wtable__add-result wtable__add-result--inline"
              aria-label={addResultLabel(ref)}
              title={addResultLabel(ref)}
              onClick={() => editing.onAddResult(row)}
            >
              <span aria-hidden="true">+</span>
            </button>
          )}
          <button
            type="button"
            className="wtable__results-close"
            onClick={close}
          >
            {tableMessages.closeResults}
          </button>
        </div>
        {artefacts === null ? (
          <p>{tableMessages.unreadableResults}</p>
        ) : (
          <ResultsTree
            file={artefacts}
            disabled={readOnly}
            onAction={onAction}
            onOpen={openResult}
          />
        )}
      </div>
    );
  }

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
