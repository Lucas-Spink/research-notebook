import { useId, type KeyboardEvent } from "react";
import { canvasMessages as m } from "./messages";

export type QuestionChoice = { key: string; label: string };

type Props = {
  questions: readonly QuestionChoice[];
  /** The key of the question showing, or `null` for none. */
  current: string | null;
  onChoose: (key: string) => void;
};

/**
 * One tab for each question (ADR-0065): each question has its own canvas.
 * Arrow keys move along the row, as in any tab list.
 */
export function QuestionTabs({ questions, current, onChoose }: Props) {
  const ids = useId();

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const step =
      event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0 || questions.length === 0) return;
    event.preventDefault();
    const at = Math.max(
      0,
      questions.findIndex((q) => q.key === current),
    );
    const next = questions[(at + step + questions.length) % questions.length];
    if (next === undefined) return;
    onChoose(next.key);
    event.currentTarget
      .closest('[role="tablist"]')
      ?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next.key)}"]`)
      ?.focus();
  }

  return (
    <div role="tablist" aria-label={m.questionsLabel} className="canvas-tabs">
      {questions.map((q) => (
        <button
          key={q.key}
          type="button"
          role="tab"
          id={`${ids}-${q.key}`}
          data-tab={q.key}
          aria-selected={q.key === current}
          tabIndex={q.key === current ? 0 : -1}
          title={q.label}
          onClick={() => onChoose(q.key)}
          onKeyDown={onKeyDown}
        >
          {q.label}
        </button>
      ))}
    </div>
  );
}
