import type {
  ArrangedExperiment,
  ArrangedQuestion,
} from "@research-notebook/format";
import { ExperimentItem, type QuestionChoice } from "./ExperimentItem";
import { tableMessages } from "./messages";
import { QuestionTools } from "./QuestionTools";
import type { NotebookActions } from "./useNotebook";

/** What is selected in the table. */
export type Selected =
  | { kind: "experiment"; item: ArrangedExperiment }
  | { kind: "question"; group: ArrangedQuestion };

type Props = {
  selected: Selected | null;
  questions: QuestionChoice[];
  sharedRefs: ReadonlySet<string>;
  actions: NotebookActions;
  disabled: boolean;
};

/**
 * Below the table: what can be done with the selected experiment or
 * question. The table's cells are read-only (FR-TBL-05), so editing, moving
 * and deleting live here until the expanded view (S2-T12) takes editing over.
 */
export function DetailsPanel({
  selected,
  questions,
  sharedRefs,
  actions,
  disabled,
}: Props) {
  return (
    <section className="notebook__details" aria-labelledby="notebook-details">
      <h4 id="notebook-details">{tableMessages.detailsHeading}</h4>
      {selected === null && <p>{tableMessages.detailsHint}</p>}
      {selected?.kind === "experiment" && (
        <ul className="notebook__experiments">
          <ExperimentItem
            item={selected.item}
            questions={questions}
            actions={actions}
            disabled={disabled}
            sharesRef={sharedRefs.has(
              selected.item.experiment.file.frontmatter.ref,
            )}
          />
        </ul>
      )}
      {selected?.kind === "question" && (
        <QuestionTools
          group={selected.group}
          actions={actions}
          disabled={disabled}
        />
      )}
    </section>
  );
}
