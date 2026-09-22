import type { ArrangedQuestion } from "@research-notebook/format";
import { useId, useState, type FormEvent } from "react";
import { ConfirmDelete } from "./ConfirmDelete";
import {
  deleteQuestionWarning,
  messages,
  newExperimentLabel,
} from "./messages";
import { NewTitleForm } from "./NewTitleForm";
import type { NotebookActions } from "./useNotebook";

type Props = {
  group: ArrangedQuestion;
  actions: NotebookActions;
  disabled: boolean;
};

function RenameForm(props: {
  title: string;
  disabled: boolean;
  onSave: (title: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const id = useId();
  const [title, setTitle] = useState(props.title);

  function submit(event: FormEvent) {
    event.preventDefault();
    void props.onSave(title).then((done) => {
      if (done) props.onClose();
    });
  }

  return (
    <form className="notebook__edit" onSubmit={submit}>
      <label htmlFor={id}>{messages.titleLabel}</label>
      <input
        id={id}
        value={title}
        disabled={props.disabled}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button type="submit" disabled={props.disabled}>
        {messages.save}
      </button>
      <button type="button" onClick={props.onClose}>
        {messages.cancel}
      </button>
    </form>
  );
}

/**
 * What can be done with the selected question: rename it, delete it, and add
 * an experiment to it. Its experiments are in the table (ADR-0026).
 */
export function QuestionTools({ group, actions, disabled }: Props) {
  const [renaming, setRenaming] = useState(false);
  const front = group.question.file.frontmatter;
  const count = group.experiments.length;

  if (group.readOnly) return <p>{messages.readOnlyItem}</p>;
  return (
    <div>
      <p>
        <strong>{front.ref}</strong> {front.title}
      </p>
      <div className="notebook__actions">
        <button
          type="button"
          disabled={disabled}
          aria-expanded={renaming}
          aria-label={`${messages.edit} ${front.ref}`}
          onClick={() => setRenaming(!renaming)}
        >
          {messages.edit}
        </button>
        <ConfirmDelete
          subject={front.ref}
          warning={deleteQuestionWarning(front.ref, count)}
          disabled={disabled}
          onConfirm={() => void actions.removeQuestion(front.id)}
        />
      </div>
      {renaming && (
        <RenameForm
          title={front.title}
          disabled={disabled}
          onSave={(title) => actions.editQuestion(front.id, title)}
          onClose={() => setRenaming(false)}
        />
      )}
      <NewTitleForm
        label={newExperimentLabel(front.ref)}
        submitLabel={messages.addExperiment}
        disabled={disabled}
        onSubmit={(title) => actions.createExperiment(front.id, title)}
      />
    </div>
  );
}
