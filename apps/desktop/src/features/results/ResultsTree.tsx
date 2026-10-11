import type { ArtefactsFileModel } from "@research-notebook/format";
import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { resultsMessages } from "./messages";
import type { GroupAction } from "./model/actions";
import { positions, treeTotals } from "./model/tree";
import { NameForm } from "./NameForm";
import { RowPanel } from "./RowPanel";
import { TreeMenu } from "./TreeMenu";
import { TreeRowView } from "./TreeRowView";
import { ROOT_KEY, useResultsTree, type ActionOutcome } from "./useResultsTree";
import "./ResultsTree.css";

type Props = {
  /** The experiment's parsed `artefacts.yaml`. */
  file: ArtefactsFileModel;
  /** The project is read-only: the tree can be browsed, not changed. */
  disabled: boolean;
  /**
   * Carries out a change and saves it. The tree never writes; it reports a
   * refusal it is given and otherwise waits for a new `file`.
   */
  onAction: (action: GroupAction) => Promise<ActionOutcome>;
  /**
   * Opens an artefact's preview (ADR-0044): by double-click, from its
   * actions, or by Enter when read-only. Left out, no file can be opened.
   */
  onOpen?: (artefactId: string) => void;
  /** Removes a result's file from the notebook, to the bin; resolves whether it was. Left out, the menu has no such entry. */
  onRemoveFile?: (artefactId: string) => Promise<boolean>;
  /** What to say before a file is removed, such as how many places refer to it. */
  removeWarning?: (artefactId: string) => string;
  /** Opens a result's file outside the application; resolves whether it worked. */
  onFileAction?: (
    artefactId: string,
    action: "openFile" | "reveal",
  ) => Promise<boolean>;
  /** Linked results whose file cannot be found now; each is marked in words. */
  missing?: ReadonlySet<string>;
  /**
   * For a table cell: the instructions are read out but not shown, and the
   * New group form opens from a button, so the tree takes little room.
   */
  compact?: boolean;
  /**
   * Whether the tree's own controls are tab stops. A table cell turns them
   * off until focus is inside it, so the grid keeps one tab stop per cell.
   */
  tabStops?: boolean;
  /** With `compact`: what the heading shows before the tree's own menu button. */
  header?: ReactNode;
  /** Hovering a result: its id and row, or `null` when the pointer leaves. */
  onHover?: (artefactId: string | null, row?: HTMLElement) => void;
  /** Somewhere a result can be dragged out to (the canvas); see `useResultsTree`. */
  outside?: Parameters<typeof useResultsTree>[0]["outside"];
  /** Pins results to the canvas from a row's menu. */
  onPin?: (artefactIds: string[]) => void;
  /** The results already on the canvas, marked in words. */
  pinned?: ReadonlySet<string>;
};

/**
 * The Results tree of one experiment (spec 7.5): virtual groups of result
 * artefacts and the Ungrouped area. Groups are created, renamed, nested,
 * reordered and deleted, and artefacts moved or added, by drag, keyboard
 * or each row's actions (FR-GRP-01 to FR-GRP-06).
 */
export function ResultsTree({
  file,
  disabled,
  onAction,
  onOpen,
  onRemoveFile,
  removeWarning,
  onFileAction,
  missing,
  compact = false,
  tabStops = true,
  header,
  onHover,
  outside,
  onPin,
  pinned,
}: Props) {
  const tree = useResultsTree({
    file,
    disabled,
    onAction,
    hideEmptyUngrouped: compact,
    ...(outside === undefined ? {} : { outside }),
    ...(onPin === undefined ? {} : { onPin }),
    ...(pinned === undefined ? {} : { pinned }),
    ...(onOpen === undefined ? {} : { onOpen }),
    ...(onRemoveFile === undefined ? {} : { onRemoveFile }),
    ...(removeWarning === undefined ? {} : { removeWarning }),
    ...(onFileAction === undefined ? {} : { onFileAction }),
  });
  const helpId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const places = useMemo(() => positions(tree.rows), [tree.rows]);
  const totals = useMemo(() => treeTotals(file), [file]);

  return (
    <div
      className={`results${tree.dragState?.over === ROOT_KEY ? (tree.dragState.valid ? " results--root-over" : " results--root-no-drop") : ""}`}
      data-row-key={ROOT_KEY}
    >
      {compact ? (
        <div className="results__head">
          <div className="results__head-main">{header}</div>
          <button
            ref={menuButton}
            type="button"
            className="results__tree-actions"
            tabIndex={tabStops ? undefined : -1}
            aria-label={resultsMessages.treeActions}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={resultsMessages.treeActions}
            onClick={() => setMenuOpen(!menuOpen)}
          >
            <span className="results__actions-dots" aria-hidden="true" />
          </button>
          {menuOpen && menuButton.current !== null && (
            <TreeMenu
              anchor={menuButton.current}
              disabled={disabled}
              onNewFolder={(name) =>
                tree.run({ kind: "createGroup", name, parent: null })
              }
              onExpandAll={() => tree.setAll(null, true)}
              onCollapseAll={() => tree.setAll(null, false)}
              onClose={() => setMenuOpen(false)}
            />
          )}
        </div>
      ) : (
        <>
          {disabled ? (
            <p>{resultsMessages.readOnly}</p>
          ) : (
            <NameForm
              label={resultsMessages.newGroupLabel}
              placeholder={resultsMessages.newGroupPlaceholder}
              submitLabel={resultsMessages.create}
              disabled={disabled}
              onSubmit={(name) =>
                tree.run({ kind: "createGroup", name, parent: null })
              }
            />
          )}
          <div className="results__bulk">
            <button type="button" onClick={() => tree.setAll(null, true)}>
              {resultsMessages.expandAll}
            </button>
            <button type="button" onClick={() => tree.setAll(null, false)}>
              {resultsMessages.collapseAll}
            </button>
          </div>
        </>
      )}
      <p
        id={helpId}
        className={`results__help${compact ? " results__help--hidden" : ""}`}
      >
        {resultsMessages.help}
      </p>
      <p role="status" className="results__status">
        {tree.status ?? ""}
      </p>
      <ul
        role="tree"
        aria-multiselectable="true"
        className="results__tree"
        aria-label={resultsMessages.treeLabel}
        aria-describedby={helpId}
      >
        {tree.rows.map((row) => {
          const place = places.get(row.key);
          return (
            <TreeRowView
              key={row.key}
              row={row}
              position={place?.position ?? 1}
              setSize={place?.setSize ?? 1}
              tabbable={tabStops && row.key === tree.tabKey}
              disabled={disabled}
              tree={tree}
              {...(onHover === undefined ? {} : { onHover })}
              missing={
                row.kind === "item" && (missing?.has(row.artefactId) ?? false)
              }
            />
          );
        })}
      </ul>
      <p className="results__totals">
        {resultsMessages.totals(totals.results, totals.groups)}
      </p>
      {tree.dragState !== null &&
        createPortal(
          <div
            className={`results__ghost${tree.dragState.valid ? "" : " results__ghost--no-drop"}`}
            style={{ left: tree.dragState.x + 14, top: tree.dragState.y + 14 }}
          >
            {tree.dragState.copy ? "+ " : ""}
            {tree.dragState.label}
          </div>,
          document.body,
        )}
      {tree.panel !== null && (
        <RowPanel
          file={file}
          panel={tree.panel}
          disabled={disabled}
          tree={tree}
        />
      )}
    </div>
  );
}
