import { useId, useState, type FormEvent } from "react";
import type { QuestionChoice } from "./ExperimentItem";
import { messages } from "./messages";

type Props = {
  questions: QuestionChoice[];
  disabled: boolean;
  onSubmit: (questionId: string, title: string) => Promise<boolean>;
};

/**
 * Adds an experiment under a chosen question, from anywhere in the table —
 * not only from a question already selected (FR-EXP-01). Disabled with a
 * hint when there are no questions yet to add one under.
 */
export function NewExperimentForm({ questions, disabled, onSubmit }: Props) {
  const questionId = useId();
  const titleId = useId();
  const [question, setQuestion] = useState("");
  const [title, setTitle] = useState("");
  const canSubmit = question !== "" && title.trim() !== "";

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    void onSubmit(question, title).then((done) => {
      if (done) setTitle("");
    });
  }

  return (
    <form className="notebook__new" onSubmit={submit}>
      <label htmlFor={questionId}>{messages.chooseQuestionLabel}</label>
      <select
        id={questionId}
        value={question}
        disabled={disabled || questions.length === 0}
        onChange={(event) => setQuestion(event.target.value)}
      >
        <option value="" />
        {questions.map((q) => (
          <option key={q.id} value={q.id}>
            {q.label}
          </option>
        ))}
      </select>
      <label htmlFor={titleId}>{messages.titleLabel}</label>
      <input
        id={titleId}
        value={title}
        placeholder={messages.newExperimentPlaceholder}
        disabled={disabled || questions.length === 0}
        onChange={(event) => setTitle(event.target.value)}
      />
      <button type="submit" disabled={disabled || !canSubmit}>
        {messages.addExperiment}
      </button>
    </form>
  );
}
