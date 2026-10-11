import { useEffect, useState } from "react";
import type { Selected } from "../DetailsPanel";
import {
  deleteExperimentWarning,
  deleteQuestionWarning,
  messages,
} from "../messages";
import type { NotebookActions } from "../useNotebook";
import { ribbonMessages as m } from "./messages";

type Props = {
  selected: Selected | null;
  actions: NotebookActions;
  /** Turns the command off while another action is in flight, or the project is read-only. */
  disabled: boolean;
};

type Target = {
  /** Identifies the selection, so a different one starts unconfirmed. */
  key: string;
  ref: string;
  warning: string;
  run: () => Promise<boolean>;
};

/** What the command would move: the selected question or experiment, unless it cannot be changed. */
function targetOf(selected: Selected | null, actions: NotebookActions) {
  if (selected?.kind === "experiment" && !selected.item.readOnly) {
    const front = selected.item.experiment.file.frontmatter;
    return {
      key: front.id,
      ref: front.ref,
      warning: deleteExperimentWarning(front.ref),
      run: () => actions.removeExperiment(front.id),
    } satisfies Target;
  }
  if (selected?.kind === "question" && !selected.group.readOnly) {
    const front = selected.group.question.file.frontmatter;
    return {
      key: front.id,
      ref: front.ref,
      warning: deleteQuestionWarning(
        front.ref,
        selected.group.experiments.length,
      ),
      run: () => actions.removeQuestion(front.id),
    } satisfies Target;
  }
  return null;
}

/**
 * Move to bin, in the Selection group of the ribbon's Home tab. Faded until a question
 * or experiment is selected, then accented to show it can be moved. The
 * first press only says what will happen. Nothing is deleted: the item goes
 * to the bin and can be restored from it.
 */
export function MoveToBinCommand({ selected, actions, disabled }: Props) {
  const target = targetOf(selected, actions);
  const [askingFor, setAskingFor] = useState<string | null>(null);
  const key = target?.key ?? null;
  // A different selection, or none, starts again unconfirmed.
  useEffect(() => setAskingFor(null), [key]);

  if (target !== null && askingFor === target.key) {
    return (
      <span
        role="group"
        className="ribbon__ask"
        aria-label={messages.moveToBinLabel(target.ref)}
      >
        <span>{target.warning}</span>
        <button
          type="button"
          className="ribbon__button ribbon__button--bin"
          disabled={disabled}
          onClick={() => {
            setAskingFor(null);
            void target.run();
          }}
        >
          {messages.confirmDelete}
        </button>
        <button
          type="button"
          className="ribbon__button"
          onClick={() => setAskingFor(null)}
        >
          {messages.cancel}
        </button>
      </span>
    );
  }
  return (
    <button
      type="button"
      className="ribbon__button ribbon__button--bin"
      disabled={disabled || target === null}
      title={target === null ? m.selectionHint : undefined}
      aria-label={
        target === null ? undefined : messages.moveToBinLabel(target.ref)
      }
      onClick={() => target !== null && setAskingFor(target.key)}
    >
      {messages.moveToBin}
    </button>
  );
}
