import type { CanvasFileModel } from "@research-notebook/format";
import { useMemo } from "react";
import { useSources } from "../citations";
import { canvasMessages as m } from "./messages";
import { readableCitations } from "./model/cite";
import type { ArtefactNode } from "./model/nodes";
import type { ResultInfo } from "./model/results";
import { summarise } from "./model/summary";

type Props = {
  /** The question's canvas, or `null` when it has none to read. */
  file: CanvasFileModel | null;
  /** What a figure card points at now. */
  resolve: (node: ArtefactNode) => ResultInfo;
  /** Called with a note's id when its entry is chosen; left out, entries are not buttons. */
  onSelectNote?: (id: string) => void;
};

/** The first words of a note, for a label. */
function excerpt(text: string): string {
  const line = text.trim().split("\n")[0] ?? "";
  return line.length > 60 ? `${line.slice(0, 57)}…` : line;
}

function figureText(info: ResultInfo): string {
  return info.status === "found"
    ? m.figureLine(info.name, info.experimentRef, info.shownVersion)
    : m.missingFigure;
}

/**
 * A question's notes and, under each, the figures its lines join it to and
 * the other notes it is linked to (ADR-0065). It is worked out from the canvas
 * each time, never stored, so it always agrees with the lines. The same list
 * is shown beside the canvas and in the table view.
 */
export function NotesSummary({ file, resolve, onSelectNote }: Props) {
  const { lookup } = useSources();
  const notes = useMemo(
    () => (file === null ? [] : summarise(file, resolve)),
    [file, resolve],
  );
  // Citations read as author and year here; the note keeps the citekey.
  const readable = (text: string) =>
    readableCitations(text, (key) => lookup(key)?.label ?? null);
  if (notes.length === 0) {
    return <p className="canvas-summary__empty">{m.summaryEmpty}</p>;
  }
  return (
    <ol className="canvas-summary">
      {notes.map((note) => {
        const text = note.text.trim();
        const body = (
          <span className={text === "" ? "canvas-summary__blank" : undefined}>
            {text === "" ? m.emptyNote : readable(note.text)}
          </span>
        );
        return (
          <li key={note.id} className="canvas-summary__note">
            {onSelectNote === undefined ? (
              body
            ) : (
              <button
                type="button"
                className="canvas-summary__select"
                aria-label={m.selectNote(
                  excerpt(readable(note.text)) || m.emptyNote,
                )}
                onClick={() => onSelectNote(note.id)}
              >
                {body}
              </button>
            )}
            {note.figures.length > 0 && (
              <div className="canvas-summary__refs">
                <span>{m.refersTo}</span>
                <ul>
                  {note.figures.map((figure) => (
                    <li key={figure.nodeId}>{figureText(figure.info)}</li>
                  ))}
                </ul>
              </div>
            )}
            {note.notes.length > 0 && (
              <div className="canvas-summary__refs">
                <span>{m.linkedNotes}</span>
                <ul>
                  {note.notes.map((other) => (
                    <li key={other.id}>
                      {excerpt(readable(other.text)) || m.emptyNote}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
