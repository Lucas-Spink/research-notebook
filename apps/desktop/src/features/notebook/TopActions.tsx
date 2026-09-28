import type { QuestionChoice } from "./ExperimentItem";
import { messages } from "./messages";
import { NewExperimentForm } from "./NewExperimentForm";
import { NewTitleForm } from "./NewTitleForm";
import type { NotebookActions } from "./useNotebook";

type Props = {
  questions: QuestionChoice[];
  disabled: boolean;
  actions: NotebookActions;
};

/**
 * Adding a question or an experiment, always visible at the top of the
 * table rather than only reachable by first selecting a row (FR-EXP-01,
 * FR-EXP-02).
 */
export function TopActions({ questions, disabled, actions }: Props) {
  return (
    <div className="notebook__top-actions">
      <NewTitleForm
        label={messages.newQuestionLabel}
        placeholder={messages.newQuestionPlaceholder}
        submitLabel={messages.addQuestion}
        disabled={disabled}
        onSubmit={(title) => actions.createQuestion(title)}
      />
      <NewExperimentForm
        questions={questions}
        disabled={disabled}
        onSubmit={(questionId, title) =>
          actions.createExperiment(questionId, title)
        }
      />
    </div>
  );
}
