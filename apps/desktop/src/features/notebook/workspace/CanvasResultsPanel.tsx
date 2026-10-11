import type { Arranged, ArrangedExperiment } from "@research-notebook/format";
import { useState } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import type { PinRef } from "../../canvas";
import { ResultsTree } from "../../results";
import { evidenceOf } from "../model/evidence";
import type { TableEditing } from "../table/EditableSectionCell";
import { previewVersion } from "../table/model/resultVersion";
import { useResultsCellTree } from "../table/useResultsCellTree";
import { canvasResultsMessages as m } from "./messages";
import "./CanvasResultsPanel.css";

type Props = {
  arranged: Arranged;
  folder: FolderHandle;
  editing: TableEditing;
  /** The results already on the canvas being shown. */
  pinned: ReadonlySet<string>;
  /** Pins results at a point of the window (a drop) or, with `null`, in the middle of the canvas. */
  onPin: (refs: PinRef[], screen: { x: number; y: number } | null) => void;
};

type ExperimentProps = Omit<Props, "arranged"> & { item: ArrangedExperiment };

/** The refs for pinning `artefactIds` of one experiment: its id, the result and, for a copy, its newest version. */
function refsFor(
  item: ArrangedExperiment,
  artefactIds: readonly string[],
): PinRef[] {
  const file = evidenceOf(item);
  if (file === null) return [];
  return artefactIds.map((artefactId) => {
    const version = previewVersion(file, artefactId);
    return {
      experimentId: item.experiment.file.frontmatter.id,
      artefactId,
      ...(version === null ? {} : { version }),
    };
  });
}

/** Whether a name, ref or any result name contains what was typed, ignoring case. */
function matches(item: ArrangedExperiment, text: string): boolean {
  if (text === "") return true;
  const needle = text.toLowerCase();
  const front = item.experiment.file.frontmatter;
  const names = (evidenceOf(item)?.artefacts ?? []).map((a) => a.name);
  return [front.ref, front.title, ...names].some((candidate) =>
    candidate.toLowerCase().includes(needle),
  );
}

/** One experiment's Results tree, the same tree as in the table and the side pane (ADR-0044). */
function ExperimentResults({
  item,
  folder,
  editing,
  pinned,
  onPin,
}: ExperimentProps) {
  const [open, setOpen] = useState(false);
  const file = evidenceOf(item);
  const experimentFolder = item.experiment.folder;
  const tree = useResultsCellTree(folder, experimentFolder, file, editing);
  const front = item.experiment.file.frontmatter;
  const readOnly = !editing.writable || item.readOnly;
  const count = file?.artefacts.filter((a) => a.role === "result").length ?? 0;

  return (
    <section className="canvas-results__experiment">
      <h5>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span> {front.ref}{" "}
          {front.title}
          <span className="canvas-results__count">{m.count(count)}</span>
        </button>
      </h5>
      {open &&
        (file === null ? (
          <p className="wtable__muted">{m.unreadable}</p>
        ) : count === 0 ? (
          <p className="wtable__muted">{m.noResults}</p>
        ) : (
          <ResultsTree
            file={file}
            disabled={readOnly}
            onAction={tree.onAction}
            onOpen={tree.onOpen}
            missing={tree.missing}
            pinned={pinned}
            onPin={(ids) => onPin(refsFor(item, ids), null)}
            outside={{
              zone: "canvas",
              onDrop: ({ artefactIds, x, y }) =>
                onPin(refsFor(item, artefactIds), { x, y }),
            }}
            compact
            header={<span>{m.resultsOf(front.ref)}</span>}
          />
        ))}
    </section>
  );
}

/**
 * The results of every experiment in the project, by question (ADR-0064), for
 * dragging onto the canvas. Each experiment's tree is the one the table uses,
 * so groups, icons and the actions menu are the same, and a result dragged out
 * of it stays where it is. A box narrows the list by experiment or result name.
 */
export function CanvasResultsPanel({ arranged, ...rest }: Props) {
  const [text, setText] = useState("");
  const groups = [
    ...arranged.questions.map((group) => ({
      key: group.question.fileName,
      title: `${group.question.file.frontmatter.ref} ${group.question.file.frontmatter.title}`,
      items: group.experiments,
    })),
    { key: "unassigned", title: m.unassigned, items: arranged.unassigned },
  ]
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => matches(item, text)),
    }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="canvas-results">
      <label className="canvas-results__search">
        <span className="wtable__sr">{m.searchLabel}</span>
        <input
          type="search"
          value={text}
          placeholder={m.searchPlaceholder}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {groups.length === 0 && (
        <p className="wtable__muted">{text === "" ? m.nothing : m.noMatch}</p>
      )}
      {groups.map((group) => (
        <div key={group.key} className="canvas-results__question">
          <h4>{group.title}</h4>
          {group.items.map((item) => (
            <ExperimentResults
              key={item.experiment.folder}
              item={item}
              {...rest}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
