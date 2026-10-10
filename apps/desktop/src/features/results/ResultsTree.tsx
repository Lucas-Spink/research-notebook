import type { ArtefactsFileModel } from "@research-notebook/format";
import { useId, useMemo } from "react";
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
  /** Linked results whose file cannot be found now; each is marked in words. */
  missing?: ReadonlySet<string>;
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
  missing,
}: Props) {
  const tree = useResultsTree({
    file,
    disabled,
    onAction,
    ...(onOpen === undefined ? {} : { onOpen }),
  });
  const helpId = useId();
  const places = useMemo(() => positions(tree.rows), [tree.rows]);
  const totals = useMemo(() => treeTotals(file), [file]);

  return (
    <div className="results">
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
      <p id={helpId} className="results__help">
        {resultsMessages.help}
      </p>
      <p role="status" className="results__status">
        {tree.status ?? ""}
      </p>
      <ul
        role="tree"
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
              tabbable={row.key === tree.tabKey}
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
