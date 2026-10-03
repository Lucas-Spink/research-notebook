import { useId, useState, type FormEvent } from "react";
import type { QuestionChoice } from "../ExperimentItem";
import { ribbonMessages as m } from "./messages";

type Props = {
  questions: QuestionChoice[];
  /** The question to start on: the selected one, when there is one. */
  initial: string;
  disabled: boolean;
  onCreate: (questionId: string, title: string) => Promise<boolean>;
};

/** Adds an experiment to a question chosen here, the selected one by default. */
export function NewExperimentForm({
  questions,
  initial,
  disabled,
  onCreate,
}: Props) {
  const ids = useId();
  const [question, setQuestion] = useState(initial);
  const [title, setTitle] = useState("");
  const chosen = questions.some((q) => q.id === question)
    ? question
    : (questions[0]?.id ?? "");

  function submit(event: FormEvent) {
    event.preventDefault();
    void onCreate(chosen, title).then((done) => {
      if (done) setTitle("");
    });
  }

  return (
    <form className="ribbon__form" onSubmit={submit}>
      <label htmlFor={`${ids}-q`}>{m.newExperimentQuestion}</label>
      <select
        id={`${ids}-q`}
        value={chosen}
        disabled={disabled}
        onChange={(event) => setQuestion(event.target.value)}
      >
        {questions.map((q) => (
          <option key={q.id} value={q.id}>
            {q.label}
          </option>
        ))}
      </select>
      <label htmlFor={`${ids}-t`}>{m.newExperimentTitle}</label>
      <input
        id={`${ids}-t`}
        value={title}
        disabled={disabled}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button type="submit" disabled={disabled || chosen === ""}>
        {m.addExperimentSubmit}
      </button>
    </form>
  );
}
