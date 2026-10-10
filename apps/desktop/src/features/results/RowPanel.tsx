import type { ArtefactsFileModel } from "@research-notebook/format";
import { useEffect, useRef } from "react";
import { assertNever } from "../../shared/assertNever";
import { classificationLabel, resultsMessages } from "./messages";
import { pickedAction, rowMenu, type MenuEntry } from "./model/menu";
import { artefactDetails, formatSize } from "./model/details";
import { deletionSummary } from "./model/tree";
import { NameForm } from "./NameForm";
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
  const box = useRef<HTMLElement>(null);

  useEffect(() => {
    box.current?.querySelector<HTMLElement>("button, input")?.focus();
  }, [panel]);

  function choose(entry: MenuEntry) {
    const { run } = entry;
    if (run.kind === "open") tree.open?.(run.artefactId);
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
    else if (panel.row.kind === "group" && run.kind !== "details")
      tree.setPanel({ kind: run.kind, row: panel.row });
  }

  return (
    <section
      ref={box}
      className="results__panel"
      aria-label={resultsMessages.actionsFor(rowName(panel))}
      onKeyDown={(event) => {
        if (event.key === "Escape") tree.closePanel();
      }}
    >
      <PanelBody
        file={file}
        panel={panel}
        disabled={disabled}
        tree={tree}
        choose={choose}
      />
      {panel.kind !== "rename" && panel.kind !== "newSubgroup" && (
        <button type="button" onClick={tree.closePanel}>
          {panel.kind === "confirmDelete"
            ? resultsMessages.cancel
            : resultsMessages.close}
        </button>
      )}
    </section>
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
        <ul className="results__menu">
          {rowMenu(file, panel.row, { canOpen: tree.open !== undefined }).map(
            (entry) => (
              <li key={entry.label}>
                <button
                  type="button"
                  // Opening and details only look, so they stay available read-only.
                  disabled={
                    disabled &&
                    entry.run.kind !== "open" &&
                    entry.run.kind !== "details"
                  }
                  onClick={() => choose(entry)}
                >
                  {resultsMessages.menu[entry.label]}
                </button>
              </li>
            ),
          )}
        </ul>
      );
    case "details":
      return <DetailsList file={file} artefactId={panel.row.artefactId} />;
    case "pick":
      return (
        <fieldset className="results__pick">
          <legend>{resultsMessages.pick[panel.mode]}</legend>
          {panel.targets.map((target) => {
            const action = pickedAction(panel.row, panel.mode, target.id);
            return (
              <button
                key={target.id}
                type="button"
                disabled={disabled || action === null}
                style={{ marginInlineStart: `${target.depth - 1}rem` }}
                onClick={() => action !== null && void tree.run(action)}
              >
                {panel.mode === "classify"
                  ? classificationLabel(target.id)
                  : target.name}
              </button>
            );
          })}
        </fieldset>
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
