import type { CanvasFileModel } from "@research-notebook/format";
import { useId } from "react";
import { NotesSummary, type ArtefactNode, type ResultInfo } from "../../canvas";
import { canvasNotesPaneMessages as m } from "./messages";
import type { CanvasQuestionTab } from "./model/canvasQuestions";

type Props = {
  questions: readonly CanvasQuestionTab[];
  /** The question shown, by its key, or `null` when there are none. */
  question: string | null;
  onChooseQuestion: (key: string) => void;
  /** Its canvas, or `null` while it is being read or if it could not be. */
  file: CanvasFileModel | null;
  /** Whether the canvas is being read, or could not be (`unreadable`). */
  state: "loading" | "ready" | "unreadable";
  resolve: (node: ArtefactNode) => ResultInfo;
  /** Opens the canvas view on the question shown. */
  onOpenCanvas: () => void;
};

/**
 * A question's canvas notes in the table view (ADR-0065): each note, with the
 * figures its lines join it to. It only shows them; the notes are written on
 * the canvas, which is one button away. A question that has no canvas yet has
 * no notes.
 */
export function CanvasNotesPane({
  questions,
  question,
  onChooseQuestion,
  file,
  state,
  resolve,
  onOpenCanvas,
}: Props) {
  const id = useId();
  if (questions.length === 0) {
    return <p className="wtable__muted">{m.noQuestions}</p>;
  }
  return (
    <div className="canvas-notes-pane">
      <p className="wtable__muted">{m.intro}</p>
      <div className="canvas-notes-pane__head">
        <label htmlFor={id}>{m.questionLabel}</label>
        <select
          id={id}
          value={question ?? ""}
          onChange={(event) => onChooseQuestion(event.target.value)}
        >
          {questions.map((q) => (
            <option key={q.key} value={q.key}>
              {q.label}
            </option>
          ))}
        </select>
        <button type="button" onClick={onOpenCanvas}>
          {m.openCanvas}
        </button>
      </div>
      {state === "loading" && <p>{m.loading}</p>}
      {state === "unreadable" && <p>{m.unreadable}</p>}
      {state === "ready" && <NotesSummary file={file} resolve={resolve} />}
    </div>
  );
}
