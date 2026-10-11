import type { ArtefactsFileModel } from "@research-notebook/format";
import { useState } from "react";
import { assertNever } from "../../shared/assertNever";
import { classificationLabel, resultsMessages } from "./messages";
import { pickedAction, rowMenu, type MenuEntry } from "./model/menu";
import { batchAction } from "./model/selection";
import { artefactDetails, formatSize } from "./model/details";
import { deletionSummary, type TreeRow } from "./model/tree";
import { MenuGlyph } from "./MenuGlyph";
import { NameForm } from "./NameForm";
import { Popover } from "./Popover";
import type { Panel, ResultsTreeState } from "./useResultsTree";

type Props = {
  file: ArtefactsFileModel;
  panel: Panel;
  disabled: boolean;
  tree: ResultsTreeState;
};

const rowName = (panel: Panel) =>
  panel.row.kind === "ungrouped" ? resultsMessages.ungrouped : panel.row.name;

/**
 * The actions of one row, shown under the tree: its menu, a group picker, a
 * name form or a delete confirmation. Escape closes it and returns focus
 * to the row.
 */
export function RowPanel({ file, panel, disabled, tree }: Props) {
  const anchor = tree.rowRefs.current.get(panel.row.key);
  function choose(entry: MenuEntry) {
    const { run } = entry;
    if (run.kind === "open") tree.open?.(run.artefactId);
    else if (run.kind === "file" && panel.row.kind === "item") {
      void tree.fileAction?.(panel.row.artefactId, run.action);
      tree.closePanel();
    } else if (run.kind === "renameResult" && panel.row.kind === "item")
      tree.setPanel({ kind: "renameResult", row: panel.row });
    else if (run.kind === "removeFile" && panel.row.kind === "item")
      tree.setPanel({ kind: "removeFile", row: panel.row });
    else if (run.kind === "details" && panel.row.kind === "item")
      tree.setPanel({ kind: "details", row: panel.row });
    else if (run.kind === "expandAll" || run.kind === "collapseAll") {
      if (panel.row.kind === "group")
        tree.setAll(panel.row.id, run.kind === "expandAll");
      tree.closePanel();
    } else if (run.kind === "action") void tree.run(run.action);
    else if (run.kind === "pick")
      tree.setPanel({
        kind: "pick",
        row: panel.row,
        mode: run.mode,
        targets: run.targets,
      });
    else if (
      panel.row.kind === "group" &&
      run.kind !== "details" &&
      run.kind !== "renameResult" &&
      run.kind !== "removeFile" &&
      run.kind !== "file"
    )
      tree.setPanel({ kind: run.kind, row: panel.row });
  }

  if (anchor === undefined) return null;
  // The row's own actions button is the better anchor when it has one.
  const button = anchor.querySelector<HTMLElement>(".results__actions");
  return (
    <Popover
      anchor={button ?? anchor}
      label={resultsMessages.actionsFor(rowName(panel))}
      onClose={tree.closePanel}
    >
      <PanelBody
        file={file}
        panel={panel}
        disabled={disabled}
        tree={tree}
        choose={choose}
      />
      {(panel.kind === "confirmDelete" || panel.kind === "removeFile") && (
        <button type="button" onClick={tree.closePanel}>
          {resultsMessages.cancel}
        </button>
      )}
    </Popover>
  );
}

function PanelBody({
  file,
  panel,
  disabled,
  tree,
  choose,
}: Props & { choose: (entry: MenuEntry) => void }) {
  switch (panel.kind) {
    case "menu":
      return (
        <ul className="results__menu" role="menu">
          {rowMenu(file, panel.row, {
            canOpen: tree.open !== undefined,
            canOpenFiles: tree.fileAction !== undefined,
            canRemoveFiles: tree.removeFile !== undefined,
            selected: chosenWith(tree, panel.row),
          }).map((entry) => (
            <li key={entry.label}>
              <button
                type="button"
                role="menuitem"
                // Opening and details only look, so they stay available read-only.
                disabled={
                  disabled &&
                  entry.run.kind !== "open" &&
                  entry.run.kind !== "details"
                }
                onClick={() => choose(entry)}
              >
                <MenuGlyph label={entry.label} />
                {resultsMessages.menu[entry.label]}
                {entry.run.kind === "pick" && (
                  <span className="results-popover__more" aria-hidden="true">
                    ›
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      );
    case "details":
      return <DetailsList file={file} artefactId={panel.row.artefactId} />;
    case "pick":
      return (
        <PickList file={file} panel={panel} disabled={disabled} tree={tree} />
      );
    case "rename":
      return (
        <NameForm
          label={resultsMessages.renameLabel}
          initial={panel.row.name}
          submitLabel={resultsMessages.save}
          disabled={disabled}
          focusOnShow
          onSubmit={(name) =>
            tree.run({ kind: "renameGroup", groupId: panel.row.id, name })
          }
          onCancel={tree.closePanel}
        />
      );
    case "renameResult":
      return (
        <>
          <NameForm
            label={resultsMessages.resultNameLabel}
            initial={panel.row.name}
            submitLabel={resultsMessages.save}
            disabled={disabled}
            focusOnShow
            onSubmit={(name) =>
              tree.run({
                kind: "renameArtefact",
                artefactId: panel.row.artefactId,
                name,
              })
            }
            onCancel={tree.closePanel}
          />
          <p className="wtable__muted">{resultsMessages.resultNameNote}</p>
        </>
      );
    case "newSubgroup":
      return (
        <NameForm
          label={resultsMessages.subgroupLabel}
          submitLabel={resultsMessages.create}
          disabled={disabled}
          focusOnShow
          onSubmit={(name) =>
            tree.run({ kind: "createGroup", name, parent: panel.row.id })
          }
          onCancel={tree.closePanel}
        />
      );
    case "removeFile":
      return (
        <>
          <p>{resultsMessages.removeFileAsk(panel.row.name)}</p>
          <p className="wtable__muted">{resultsMessages.removeFileNote}</p>
          {tree.removeWarning !== undefined && (
            <p>{tree.removeWarning(panel.row.artefactId)}</p>
          )}
          <button
            type="button"
            disabled={disabled}
            onClick={() => void tree.removeFile?.(panel.row.artefactId)}
          >
            {resultsMessages.removeFileConfirm}
          </button>
        </>
      );
    case "confirmDelete":
      return (
        <>
          <p>
            {resultsMessages.confirmDelete(
              panel.row.name,
              deletionSummary(file, panel.row.id),
            )}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              void tree.run({ kind: "deleteGroup", groupId: panel.row.id })
            }
          >
            {resultsMessages.deleteGroup}
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() =>
              void tree.run({ kind: "dissolveGroup", groupId: panel.row.id })
            }
          >
            {resultsMessages.dissolveGroup}
          </button>
          <p className="wtable__muted">{resultsMessages.dissolveNote}</p>
        </>
      );
    default:
      return assertNever(panel);
  }
}

function DetailsList({
  file,
  artefactId,
}: {
  file: ArtefactsFileModel;
  artefactId: string;
}) {
  const m = resultsMessages.details;
  const details = artefactDetails(file, artefactId);
  if (details === null) return null;
  const rows: [string, string][] = [
    [m.type, details.type],
    [m.storage, details.mode === "copy" ? m.copy : m.link],
    [
      m.classification,
      details.classification === null
        ? m.none
        : classificationLabel(details.classification),
    ],
    [m.size, formatSize(details.size)],
    [m.added, details.added],
    [m.source, details.sourcePath],
    [
      m.folders,
      details.folders.length === 0 ? m.ungrouped : details.folders.join("; "),
    ],
  ];
  return (
    <dl className="results__details">
      {rows.map(([term, value]) => (
        <div key={term}>
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The chosen artefacts when `row` is one of several, else none: the menu then acts on all of them. */
function chosenWith(tree: ResultsTreeState, row: TreeRow) {
  return row.kind === "item" &&
    tree.chosen.length > 1 &&
    tree.chosen.some((c) => c.key === row.key)
    ? tree.chosen
    : [];
}

/** What choosing `target` in a picker does: for several chosen artefacts, one batch. */
function pickedFor(
  file: ArtefactsFileModel,
  tree: ResultsTreeState,
  panel: Extract<Panel, { kind: "pick" }>,
  target: string,
) {
  const several = chosenWith(tree, panel.row);
  if (several.length > 0 && (panel.mode === "moveTo" || panel.mode === "addTo"))
    return batchAction(file, several, panel.mode, target);
  return pickedAction(panel.row, panel.mode, target);
}

/** More destinations than this get a filter box. */
const FILTER_ABOVE = 8;

/**
 * The compact "Move to…" list: back to the menu, an optional filter for long
 * lists, then the destinations, indented by depth and scrolling inside the
 * popover rather than growing the table.
 */
function PickList({
  file,
  panel,
  disabled,
  tree,
}: {
  file: ArtefactsFileModel;
  panel: Extract<Panel, { kind: "pick" }>;
  disabled: boolean;
  tree: ResultsTreeState;
}) {
  const [filter, setFilter] = useState("");
  const wanted = filter.trim().toLowerCase();
  const shown = panel.targets.filter(
    (target) =>
      wanted === "" ||
      (panel.mode === "classify" ? classificationLabel(target.id) : target.name)
        .toLowerCase()
        .includes(wanted),
  );
  return (
    <div
      className="results__pick"
      role="group"
      aria-label={resultsMessages.pick[panel.mode]}
    >
      <button
        type="button"
        className="results-popover__back"
        onClick={() => tree.setPanel({ kind: "menu", row: panel.row })}
      >
        <span aria-hidden="true">‹</span> {resultsMessages.pick[panel.mode]}
      </button>
      {panel.targets.length > FILTER_ABOVE && (
        <input
          type="search"
          className="results-popover__filter"
          aria-label={resultsMessages.filterTargets}
          placeholder={resultsMessages.filterTargets}
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      )}
      <div className="results-popover__list">
        {shown.map((target) => {
          const action = pickedFor(file, tree, panel, target.id);
          return (
            <button
              key={target.id}
              type="button"
              disabled={disabled || action === null}
              style={{ paddingInlineStart: `${6 + (target.depth - 1) * 10}px` }}
              onClick={() => action !== null && void tree.run(action)}
            >
              {panel.mode === "classify"
                ? classificationLabel(target.id)
                : target.name}
            </button>
          );
        })}
        {shown.length === 0 && (
          <span className="results-popover__none">
            {resultsMessages.noTargets}
          </span>
        )}
      </div>
    </div>
  );
}
