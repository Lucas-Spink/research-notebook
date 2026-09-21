import type { ArrangedExperiment } from "@research-notebook/format";
import { useId, useState } from "react";
import { ConfirmDelete } from "./ConfirmDelete";
import { ExperimentEditForm } from "./ExperimentEditForm";
import { deleteExperimentWarning, messages, statusLabel } from "./messages";
import type { NotebookActions } from "./useNotebook";

/** A question an experiment can be moved to. */
export type QuestionChoice = { id: string; label: string };

type Props = {
  item: ArrangedExperiment;
  questions: QuestionChoice[];
  actions: NotebookActions;
  disabled: boolean;
  /** The ref is shared with another experiment of the same kind. */
  sharesRef: boolean;
};

function dates(started: string | undefined, completed: string | undefined) {
  const parts = [
    started === undefined ? null : `${messages.startedLabel} ${started}`,
    completed === undefined ? null : `${messages.completedLabel} ${completed}`,
  ];
  return parts.filter((part) => part !== null).join(" · ");
}

/** One experiment: its ref, title, status and dates, and what can be done with it. */
export function ExperimentItem({
  item,
  questions,
  actions,
  disabled,
  sharesRef,
}: Props) {
  const { experiment, readOnly, absentFromOrder } = item;
  const front = experiment.file.frontmatter;
  const moveId = useId();
  const [editing, setEditing] = useState(false);
  const [target, setTarget] = useState("");
  const others = questions.filter((q) => q.id !== front.question);

  return (
    <li className="notebook__experiment">
      <div>
        <strong>{front.ref}</strong> {front.title}{" "}
        <span className="notebook__status">{statusLabel(front.status)}</span>
        {dates(front.started, front.completed) !== "" && (
          <span className="notebook__dates">
            {" "}
            {dates(front.started, front.completed)}
          </span>
        )}
        {sharesRef && (
          <span className="notebook__flag"> {messages.duplicateRefBadge}</span>
        )}
        {absentFromOrder && !readOnly && (
          <span className="notebook__flag"> {messages.notInOrder}</span>
        )}
        {readOnly && (
          <span className="notebook__flag"> {messages.readOnlyItem}</span>
        )}
      </div>
      {!readOnly && (
        <div className="notebook__actions">
          <button
            type="button"
            disabled={disabled}
            aria-expanded={editing}
            aria-label={`${messages.edit} ${front.ref}`}
            onClick={() => setEditing(!editing)}
          >
            {messages.edit}
          </button>
          {others.length > 0 && (
            <>
              <label htmlFor={moveId}>{messages.moveLabel}</label>
              <select
                id={moveId}
                value={target}
                disabled={disabled}
                onChange={(event) => setTarget(event.target.value)}
              >
                <option value="" />
                {others.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={disabled || target === ""}
                aria-label={`${messages.move} ${front.ref}`}
                onClick={() => {
                  void actions
                    .moveExperiment(front.id, target)
                    .then((done) => done && setTarget(""));
                }}
              >
                {messages.move}
              </button>
            </>
          )}
          <ConfirmDelete
            subject={front.ref}
            warning={deleteExperimentWarning(front.ref)}
            disabled={disabled}
            onConfirm={() => void actions.removeExperiment(front.id)}
          />
        </div>
      )}
      {editing && !readOnly && (
        <ExperimentEditForm
          experiment={experiment}
          disabled={disabled}
          onSave={(changes) => actions.editExperiment(front.id, changes)}
          onClose={() => setEditing(false)}
        />
      )}
    </li>
  );
}
