import type { Arranged } from "@research-notebook/format";
import { useId, type KeyboardEvent } from "react";
import type { LiveEditor } from "../editing/useLiveEditor";
import { ExpandedExperimentView } from "../expanded/ExpandedExperimentView";
import { writingMessages as m } from "./messages";
import "./CanvasWritingPanel.css";
import { tabsOf, type WritingTabs } from "./model/writingTabs";

type Props = {
  arranged: Arranged;
  /** Which question and experiment are showing; the notebook view owns it so a card can change it. */
  tabs: WritingTabs;
  onChooseQuestion: (key: string) => void;
  onChooseExperiment: (folder: string) => void;
  /** The application's one live section editor (FR-EDT-03, ADR-0043). */
  live: LiveEditor;
  writable: boolean;
  /** Opens a result a figure reference points to, in the side pane. */
  onOpenResult: (
    experimentFolder: string,
    artefactId: string,
    version: number | null,
  ) => void;
};

/** Moves among the tabs of one row with the arrow keys, as a tab list does. */
function arrowKeys(
  event: KeyboardEvent<HTMLElement>,
  keys: readonly string[],
  current: string | null,
  choose: (key: string) => void,
) {
  const step =
    event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
  if (step === 0 || keys.length === 0) return;
  event.preventDefault();
  const at = Math.max(0, keys.indexOf(current ?? ""));
  const next = keys[(at + step + keys.length) % keys.length];
  if (next === undefined) return;
  choose(next);
  event.currentTarget
    .closest('[role="tablist"]')
    ?.querySelector<HTMLElement>(`[data-tab="${CSS.escape(next)}"]`)
    ?.focus();
}

/**
 * The writing beside the canvas (ADR-0064): a tab for each question and,
 * under them, one for each experiment in the question shown, then that
 * experiment's Methods, Results Notes and Interpretation. The sections are the
 * table's own editors, on the same experiment files, with the same references
 * and citations; only one is live at a time, in the whole window. Changing a
 * tab is left to the notebook view, which saves what is being typed first.
 */
export function CanvasWritingPanel({
  arranged,
  tabs,
  onChooseQuestion,
  onChooseExperiment,
  live,
  writable,
  onOpenResult,
}: Props) {
  const ids = useId();
  const questions = tabsOf(arranged);
  const question = questions.find((q) => q.key === tabs.question);
  const item = [
    ...arranged.questions.flatMap((group) => group.experiments),
    ...arranged.unassigned,
  ].find((candidate) => candidate.experiment.folder === tabs.experiment);

  if (questions.length === 0) {
    return <p className="wtable__muted">{m.noQuestions}</p>;
  }
  const questionKeys = questions.map((q) => q.key);
  const experimentKeys = question?.experiments.map((e) => e.folder) ?? [];

  return (
    <div className="canvas-writing">
      <div role="tablist" aria-label={m.questionsLabel} className="canvas-tabs">
        {questions.map((q) => (
          <button
            key={q.key}
            type="button"
            role="tab"
            id={`${ids}-q-${q.key}`}
            data-tab={q.key}
            aria-selected={q.key === tabs.question}
            aria-controls={`${ids}-panel`}
            tabIndex={q.key === tabs.question ? 0 : -1}
            title={q.label}
            onClick={() => onChooseQuestion(q.key)}
            onKeyDown={(event) =>
              arrowKeys(event, questionKeys, tabs.question, onChooseQuestion)
            }
          >
            {q.label}
          </button>
        ))}
      </div>
      <div
        role="tablist"
        aria-label={m.experimentsLabel}
        className="canvas-tabs canvas-tabs--experiments"
      >
        {question?.experiments.map((e) => (
          <button
            key={e.folder}
            type="button"
            role="tab"
            id={`${ids}-e-${e.folder}`}
            data-tab={e.folder}
            aria-selected={e.folder === tabs.experiment}
            aria-controls={`${ids}-panel`}
            tabIndex={e.folder === tabs.experiment ? 0 : -1}
            title={e.label}
            onClick={() => onChooseExperiment(e.folder)}
            onKeyDown={(event) =>
              arrowKeys(
                event,
                experimentKeys,
                tabs.experiment,
                onChooseExperiment,
              )
            }
          >
            {e.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${ids}-panel`}
        aria-labelledby={
          tabs.experiment === null
            ? `${ids}-q-${tabs.question ?? ""}`
            : `${ids}-e-${tabs.experiment}`
        }
        className="canvas-writing__panel"
      >
        {item === undefined ? (
          <p className="wtable__muted">{m.noExperiments}</p>
        ) : (
          <ExpandedExperimentView
            item={item}
            disabled={!writable}
            onOpenResult={onOpenResult}
            focusSection={null}
            live={live}
            surface="canvas"
            stacked
          />
        )}
      </div>
    </div>
  );
}
