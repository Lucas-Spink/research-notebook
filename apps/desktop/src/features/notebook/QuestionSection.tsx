import type { ArrangedQuestion } from "@research-notebook/format";
import { useId, useState, type FormEvent } from "react";
import { ConfirmDelete } from "./ConfirmDelete";
import { ExperimentItem, type QuestionChoice } from "./ExperimentItem";
import {
  deleteQuestionWarning,
  messages,
  newExperimentLabel,
} from "./messages";
import { NewTitleForm } from "./NewTitleForm";
import type { NotebookActions } from "./useNotebook";

type Props = {
  group: ArrangedQuestion;
  questions: QuestionChoice[];
  /** Refs that more than one file of the same kind holds. */
  sharedRefs: ReadonlySet<string>;
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

/** One question with its experiments, and the forms to add an experiment, rename or delete it. */
export function QuestionSection({
  group,
  questions,
  sharedRefs,
  actions,
  disabled,
}: Props) {
  const headingId = useId();
  const [renaming, setRenaming] = useState(false);
  const front = group.question.file.frontmatter;
  const count = group.experiments.length;

  return (
    <section className="notebook__question" aria-labelledby={headingId}>
      <h4 id={headingId}>
        {front.ref} {front.title}
        {sharedRefs.has(front.ref) && (
          <span className="notebook__flag"> {messages.duplicateRefBadge}</span>
        )}
        {group.readOnly && (
          <span className="notebook__flag"> {messages.readOnlyItem}</span>
        )}
      </h4>
      {!group.readOnly && (
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
      )}
      {renaming && !group.readOnly && (
        <RenameForm
          title={front.title}
          disabled={disabled}
          onSave={(title) => actions.editQuestion(front.id, title)}
          onClose={() => setRenaming(false)}
        />
      )}
      {count === 0 ? (
        <p>{messages.noExperiments}</p>
      ) : (
        <ul className="notebook__experiments">
          {group.experiments.map((item) => (
            <ExperimentItem
              key={item.experiment.folder}
              item={item}
              questions={questions}
              actions={actions}
              disabled={disabled}
              sharesRef={sharedRefs.has(item.experiment.file.frontmatter.ref)}
            />
          ))}
        </ul>
      )}
      {!group.readOnly && (
        <NewTitleForm
          label={newExperimentLabel(front.ref)}
          submitLabel={messages.addExperiment}
          disabled={disabled}
          onSubmit={(title) => actions.createExperiment(front.id, title)}
        />
      )}
    </section>
  );
}
