import type { ArtefactsFileModel } from "@research-notebook/format";
import { useId, useMemo, useState } from "react";
import { resultsMessages } from "./messages";
import type { GroupAction } from "./model/actions";
import { positions, treeTotals } from "./model/tree";
import { NameForm } from "./NameForm";
import { RowPanel } from "./RowPanel";
import { TreeRowView } from "./TreeRowView";
import { useResultsTree, type ActionOutcome } from "./useResultsTree";
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
  onFileAction,
  missing,
  compact = false,
  tabStops = true,
}: Props) {
  const tree = useResultsTree({
    file,
    disabled,
    onAction,
    ...(onOpen === undefined ? {} : { onOpen }),
    ...(onFileAction === undefined ? {} : { onFileAction }),
  });
  const helpId = useId();
  const [formOpen, setFormOpen] = useState(false);
  const places = useMemo(() => positions(tree.rows), [tree.rows]);
  const totals = useMemo(() => treeTotals(file), [file]);

  return (
    <div className="results">
      {disabled ? (
        <p>{resultsMessages.readOnly}</p>
      ) : compact && !formOpen ? (
        <button
          type="button"
          className="results__new"
          tabIndex={tabStops ? undefined : -1}
          onClick={() => setFormOpen(true)}
        >
          {resultsMessages.newGroupLabel}
        </button>
      ) : (
        <NameForm
          label={resultsMessages.newGroupLabel}
          placeholder={resultsMessages.newGroupPlaceholder}
          submitLabel={resultsMessages.create}
          disabled={disabled}
          focusOnShow={compact}
          onSubmit={async (name) => {
            const done = await tree.run({
              kind: "createGroup",
              name,
              parent: null,
            });
            if (done) setFormOpen(false);
            return done;
          }}
          {...(compact ? { onCancel: () => setFormOpen(false) } : {})}
        />
      )}
      <div className="results__bulk">
        <button
          type="button"
          tabIndex={tabStops ? undefined : -1}
          onClick={() => tree.setAll(null, true)}
        >
          {resultsMessages.expandAll}
        </button>
        <button
          type="button"
          tabIndex={tabStops ? undefined : -1}
          onClick={() => tree.setAll(null, false)}
        >
          {resultsMessages.collapseAll}
        </button>
      </div>
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
