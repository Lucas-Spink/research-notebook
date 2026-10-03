import { useId } from "react";
import { RibbonMenu } from "../../../shared/ribbon";
import { ConfirmDelete } from "../ConfirmDelete";
import type { Selected } from "../DetailsPanel";
import type { QuestionChoice } from "../ExperimentItem";
import {
  deleteExperimentWarning,
  deleteQuestionWarning,
  messages,
  statusLabel,
  statusOfLabel,
  statusOptions,
} from "../messages";
import type { NotebookActions } from "../useNotebook";
import { ribbonMessages as m } from "./messages";

type Props = {
  selected: Selected | null;
  questions: QuestionChoice[];
  actions: NotebookActions;
  /** Turns off one-shot actions while another is in flight, or the project is read-only. */
  disabled: boolean;
};

/**
 * What can be done with the selected question or experiment: change its
 * status in the ribbon, and, under More actions, which are used less often,
 * move it or delete it. Status and move save as soon as they are chosen.
 */
export function SelectionCommands({
  selected,
  questions,
  actions,
  disabled,
}: Props) {
  const ids = useId();
  if (selected?.kind === "experiment" && !selected.item.readOnly) {
    const front = selected.item.experiment.file.frontmatter;
    const others = questions.filter((q) => q.id !== front.question);
    return (
      <>
        <label htmlFor={`${ids}-status`}>{m.changeStatus}</label>
        <select
          id={`${ids}-status`}
          aria-label={statusOfLabel(front.ref)}
          value={front.status}
          disabled={disabled}
          onChange={(event) => {
            const status = statusOptions.find((s) => s === event.target.value);
            if (status !== undefined)
              void actions.editExperiment(front.id, { status });
          }}
        >
          {statusOptions.map((option) => (
            <option key={option} value={option}>
              {statusLabel(option)}
            </option>
          ))}
        </select>
        <RibbonMenu label={m.moreActions} disabled={disabled}>
          {(close) => (
            <>
              {others.length > 0 && (
                <p>
                  <label htmlFor={`${ids}-move`}>{m.moveTo}</label>{" "}
                  <select
                    id={`${ids}-move`}
                    aria-label={`${messages.move} ${front.ref}`}
                    value=""
                    onChange={(event) => {
                      if (event.target.value === "") return;
                      close();
                      void actions.moveExperiment(front.id, event.target.value);
                    }}
                  >
                    <option value="">{m.moveToNone}</option>
                    {others.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.label}
                      </option>
                    ))}
                  </select>
                </p>
              )}
              <ConfirmDelete
                subject={front.ref}
                warning={deleteExperimentWarning(front.ref)}
                disabled={disabled}
                onConfirm={() => {
                  close();
                  void actions.removeExperiment(front.id);
                }}
              />
            </>
          )}
        </RibbonMenu>
      </>
    );
  }
  if (selected?.kind === "question" && !selected.group.readOnly) {
    const front = selected.group.question.file.frontmatter;
    return (
      <RibbonMenu label={m.moreActions} disabled={disabled}>
        {(close) => (
          <ConfirmDelete
            subject={front.ref}
            warning={deleteQuestionWarning(
              front.ref,
              selected.group.experiments.length,
            )}
            disabled={disabled}
            onConfirm={() => {
              close();
              void actions.removeQuestion(front.id);
            }}
          />
        )}
      </RibbonMenu>
    );
  }
  return <span className="ribbon__hint">{m.selectionHint}</span>;
}
