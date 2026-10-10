import type { ArtefactsFileModel } from "@research-notebook/format";
import { useRef, useState } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import { ResultsTree } from "../../results";
import { addResultLabel, browseResultsLabel, tableMessages } from "../messages";
import { CodeFolder } from "../workspace/CodeFolder";
import type { TableEditing } from "./EditableSectionCell";
import type { ExperimentRow } from "./model/rows";
import { useResultsCellTree } from "./useResultsCellTree";

type Props = {
  row: ExperimentRow;
  /** The experiment's artefacts.yaml, or `null` when it could not be read. */
  artefacts: ArtefactsFileModel | null;
  folder: FolderHandle;
  editing: TableEditing;
  /** Whether this cell holds the grid's one tab stop (ADR-0043 point 5). */
  tabbable: boolean;
};

/** Keys that move from the cell's heading into its tree. */
const ENTER_KEYS = new Set(["Enter", " ", "F2"]);

/**
 * The Results cell (FR-TBL-06, issue #101): this experiment's result groups
 * as a nested, collapsible file tree inside the cell, with the plus to add
 * results. Folders open and close in place and the row grows to fit, so the
 * table keeps its own layout. Groups are virtual: they are saved in
 * `artefacts.yaml` and never create folders on disk. Opening a result uses
 * the preview pane. A read-only project or experiment can browse but not
 * change anything.
 *
 * The cell's heading holds the grid's one tab stop. Enter, Space or F2 on it
 * moves into the tree, whose own keys the grid leaves alone; Escape in the
 * tree returns to the heading.
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
  const head = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  // The tree's controls are tab stops only once focus is inside it.
  const [inside, setInside] = useState(false);
  const treeProps = useResultsCellTree(
    folder,
    experiment.folder,
    artefacts,
    editing,
  );

  return (
    <div className="wtable__results-wrap">
      <div className="wtable__results-head">
        <div
          ref={head}
          role="group"
          tabIndex={tabbable ? 0 : -1}
          data-grid-focus
          className="wtable__results-title"
          aria-label={browseResultsLabel(ref)}
          onKeyDown={(event) => {
            if (ENTER_KEYS.has(event.key)) {
              event.preventDefault();
              body.current
                ?.querySelector<HTMLElement>('[role="treeitem"]')
                ?.focus();
            } else if (event.key === "+" && !readOnly) {
              event.preventDefault();
              editing.onAddResult(row);
            }
          }}
        >
          {tableMessages.resultsHeading}
        </div>
        {!readOnly && (
          <button
            type="button"
            className="wtable__add-result wtable__add-result--inline"
            // The grid has one tab stop per cell (ADR-0043): by keyboard, press + in the heading.
            tabIndex={-1}
            aria-label={addResultLabel(ref)}
            title={addResultLabel(ref)}
            onClick={() => editing.onAddResult(row)}
          >
            <span aria-hidden="true">+</span>
          </button>
        )}
      </div>
      <div
        ref={body}
        className="wtable__results-open"
        onFocus={() => setInside(true)}
        onBlur={(event) => {
          const to = event.relatedTarget;
          if (!(to instanceof Node) || !event.currentTarget.contains(to))
            setInside(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && !event.defaultPrevented) {
            event.preventDefault();
            head.current?.focus();
          }
        }}
      >
        {artefacts === null ? (
          <span className="wtable__muted">{tableMessages.resultsNone}</span>
        ) : (
          <>
            <ResultsTree
              compact
              tabStops={inside}
              file={artefacts}
              disabled={readOnly}
              {...treeProps}
            />
            <CodeFolder
              file={artefacts}
              folder={folder}
              experimentFolder={experiment.folder}
              editing={editing}
              readOnly={readOnly}
              onOpen={treeProps.onOpen}
              tabStops={inside}
            />
          </>
        )}
      </div>
    </div>
  );
}
