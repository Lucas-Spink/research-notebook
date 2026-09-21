import type { Arranged, Problem } from "@research-notebook/format";
import { ExperimentItem, type QuestionChoice } from "./ExperimentItem";
import { messages, problemMessage } from "./messages";
import { NewTitleForm } from "./NewTitleForm";
import { QuestionSection } from "./QuestionSection";
import type { NotebookModel } from "./useNotebook";
import "./NotebookPanel.css";

/** The refs that two or more files of one kind hold, so each can be flagged where it is shown. */
function sharedRefs(problems: readonly Problem[]): ReadonlySet<string> {
  return new Set(
    problems.flatMap((p) => (p.kind === "duplicateRef" ? [p.ref] : [])),
  );
}

function choices(arranged: Arranged): QuestionChoice[] {
  return arranged.questions
    .filter((group) => !group.readOnly)
    .map(({ question }) => ({
      id: question.file.frontmatter.id,
      label: `${question.file.frontmatter.ref} ${question.file.frontmatter.title}`,
    }));
}

/**
 * The questions and experiments of the open project (FR-EXP-01 to 08), as a
 * plain list with forms. It renders what `useNotebook` holds and asks it to
 * act; it does no I/O. The table (S2-T11) replaces this view.
 */
export function NotebookView({ notebook }: { notebook: NotebookModel }) {
  const { view, arranged, busy, writable, notice, failure, actions } = notebook;
  const disabled = busy || !writable;

  return (
    <section className="notebook" aria-labelledby="notebook-heading">
      <h3 id="notebook-heading">{messages.heading}</h3>
      {!writable && <p className="notebook__note">{messages.readOnly}</p>}
      <div role="status" aria-live="polite">
        {busy && <p>{messages.working}</p>}
        {notice !== null && <p className="notebook__notice">{notice}</p>}
        {failure !== null && <p className="notebook__notice">{failure}</p>}
        {view.status === "loading" && <p>{messages.loading}</p>}
      </div>
      {arranged !== null && (
        <>
          <button
            type="button"
            disabled={busy}
            onClick={() => void actions.refresh()}
          >
            {messages.refresh}
          </button>
          {arranged.problems.length > 0 && (
            <section aria-labelledby="notebook-problems">
              <h4 id="notebook-problems">{messages.problemsHeading}</h4>
              <ul className="notebook__problems">
                {arranged.problems.map((problem, index) => (
                  <li key={`${problem.kind}-${index}`}>
                    {problemMessage(problem)}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {arranged.questions.length === 0 &&
            arranged.unassigned.length === 0 && <p>{messages.empty}</p>}
          {arranged.questions.map((group) => (
            <QuestionSection
              key={group.question.fileName}
              group={group}
              questions={choices(arranged)}
              sharedRefs={sharedRefs(arranged.problems)}
              actions={actions}
              disabled={disabled}
            />
          ))}
          {arranged.unassigned.length > 0 && (
            <section
              className="notebook__question"
              aria-labelledby="notebook-unassigned"
            >
              <h4 id="notebook-unassigned">{messages.unassignedHeading}</h4>
              <p>{messages.unassignedNote}</p>
              <ul className="notebook__experiments">
                {arranged.unassigned.map((item) => (
                  <ExperimentItem
                    key={item.experiment.folder}
                    item={item}
                    questions={choices(arranged)}
                    actions={actions}
                    disabled={disabled}
                    sharesRef={sharedRefs(arranged.problems).has(
                      item.experiment.file.frontmatter.ref,
                    )}
                  />
                ))}
              </ul>
            </section>
          )}
          <NewTitleForm
            label={messages.newQuestionLabel}
            placeholder={messages.newQuestionPlaceholder}
            submitLabel={messages.addQuestion}
            disabled={disabled}
            onSubmit={(title) => actions.createQuestion(title)}
          />
        </>
      )}
    </section>
  );
}
