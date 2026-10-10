import type { ArtefactsFileModel } from "@research-notebook/format";
import { useEffect, useRef, useState } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import { ResultsTree } from "../../results";
import { addResultLabel, browseResultsLabel, tableMessages } from "../messages";
import { CodeFolder } from "../workspace/CodeFolder";
import type { TableEditing } from "./EditableSectionCell";
import type { ExperimentRow } from "./model/rows";
import { ResultHoverPreview, type HoverTarget } from "./ResultHoverPreview";
import { fileKindOf } from "../../../shared/FileIcons";
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

  const hover = useResultHover(artefacts);

  const header = (
    <>
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
        <span className="wtable__sr">{tableMessages.resultsHeading}</span>
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
    </>
  );

  return (
    <div className="wtable__results-wrap">
      <div
        ref={body}
        className="wtable__results-open"
        onFocus={(event) => {
          // The heading is the cell's own tab stop; only the tree counts as inside.
          if (!(
            event.target instanceof Node && head.current?.contains(event.target)
          ))
            setInside(true);
        }}
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
          <>
            <div className="results__head">
              <div className="results__head-main">{header}</div>
            </div>
            <span className="wtable__muted">{tableMessages.resultsNone}</span>
          </>
        ) : (
          <>
            <ResultsTree
              compact
              header={header}
              tabStops={inside}
              file={artefacts}
              disabled={readOnly}
              onHover={hover.onHover}
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
      {hover.shown !== null && (
        <ResultHoverPreview
          folder={folder}
          experimentFolder={experiment.folder}
          target={hover.shown.target}
          anchor={hover.shown.anchor}
          onEnter={hover.keep}
          onLeave={hover.leave}
        />
      )}
    </div>
  );
}

/** The pointer may cross the gap between a row and its preview without the preview closing. */
const HIDE_DELAY_MS = 150;

/**
 * Which result's larger preview is showing, if any (FR-TBL-06). A copied
 * result has a captured file to show; a linked one has none, so it gets no
 * preview. The preview stays a moment after the pointer leaves, so it can
 * be reached.
 */
function useResultHover(artefacts: ArtefactsFileModel | null) {
  const [shown, setShown] = useState<{
    target: HoverTarget;
    anchor: DOMRect;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const keep = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const leave = () => {
    keep();
    timer.current = setTimeout(() => setShown(null), HIDE_DELAY_MS);
  };
  useEffect(() => keep, []);

  function onHover(artefactId: string | null, row?: HTMLElement) {
    if (artefactId === null || row === undefined) {
      leave();
      return;
    }
    keep();
    const found = artefacts?.artefacts.find((a) => a.id === artefactId);
    const latest =
      found?.mode === "copy"
        ? found.versions.reduce((best, v) => (v.v > best.v ? v : best))
        : undefined;
    // Only what has something to look at gets a preview: tables and text do not.
    const kind =
      found === undefined ? null : fileKindOf(found.name, found.type);
    const previewable = kind === "image" || kind === "vector" || kind === "pdf";
    if (found === undefined || latest === undefined || !previewable) {
      setShown(null);
      return;
    }
    setShown({
      target: {
        name: found.name,
        type: found.type,
        file: latest.file,
        sha256: latest.sha256,
      },
      anchor: row.getBoundingClientRect(),
    });
  }

  return { shown, keep, leave, onHover };
}
