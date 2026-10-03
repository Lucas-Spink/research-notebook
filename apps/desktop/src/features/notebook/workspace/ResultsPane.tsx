import type { Arranged } from "@research-notebook/format";
import type { FolderHandle } from "../../../ipc/bindings";
import {
  applyGroupAction,
  ResultsTree,
  type ActionOutcome,
  type GroupAction,
} from "../../results";
import { evidenceOf } from "../model/evidence";
import type { TableEditing } from "../table/EditableSectionCell";
import { previewVersion } from "../table/model/resultVersion";
import { CodeFolder } from "./CodeFolder";
import { paneMessages, resultsBrowserMessages as m } from "./messages";
import type { PaneTab } from "./model/panes";
import "./ResultsPane.css";

type Props = {
  tab: Extract<PaneTab, { kind: "results" }>;
  arranged: Arranged;
  folder: FolderHandle;
  editing: TableEditing;
  /** Opens the Add result pane for this experiment. */
  onAddResults: (experimentFolder: string) => void;
};

/**
 * One experiment's Results browser, in the side pane (S6-T01): its result
 * groups as folders and its files with a type icon after each name, which
 * are moved between folders by dragging or from each row's ⋯ menu, and the
 * Code folder of linked scripts. Opening a file shows its preview in
 * another tab.
 */
export function ResultsPane({
  tab,
  arranged,
  folder,
  editing,
  onAddResults,
}: Props) {
  const item = [
    ...arranged.questions.flatMap((group) => group.experiments),
    ...arranged.unassigned,
  ].find((candidate) => candidate.experiment.folder === tab.experimentFolder);
  const file = item === undefined ? null : evidenceOf(item);
  if (item === undefined || file === null) {
    return <p>{paneMessages.resultUnavailable}</p>;
  }
  const readOnly = !editing.writable || item.readOnly;
  const front = item.experiment.file.frontmatter;

  async function onAction(action: GroupAction): Promise<ActionOutcome> {
    const outcome = await editing.editArtefacts(
      tab.experimentFolder,
      (current, env) => applyGroupAction(current, action, env),
    );
    // A save that failed for another reason is already in the notice.
    return outcome.ok || outcome.error === null
      ? { ok: true }
      : { ok: false, error: outcome.error };
  }

  const open = (artefactId: string) =>
    editing.onOpenResult(
      tab.experimentFolder,
      artefactId,
      previewVersion(file, artefactId),
    );

  return (
    <div className="results-pane">
      <header className="results-pane__head">
        <h3>{m.heading(front.ref)}</h3>
        {!readOnly && (
          <button
            type="button"
            onClick={() => onAddResults(tab.experimentFolder)}
          >
            {m.addResults}
          </button>
        )}
      </header>
      <p className="results-pane__title">{front.title}</p>
      <p className="wtable__muted">{m.hint}</p>
      <ResultsTree
        file={file}
        disabled={readOnly}
        onAction={onAction}
        onOpen={open}
      />
      <CodeFolder
        file={file}
        folder={folder}
        experimentFolder={tab.experimentFolder}
        editing={editing}
        readOnly={readOnly}
        onOpen={open}
      />
    </div>
  );
}
