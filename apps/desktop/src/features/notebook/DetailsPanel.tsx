import type {
  ArrangedExperiment,
  ArrangedQuestion,
  RecognisedSectionKey,
} from "@research-notebook/format";
import type { LiveEditor } from "./editing/useLiveEditor";
import { ExpandedExperimentView } from "./expanded/ExpandedExperimentView";
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
  /** Turns off the one-shot buttons (edit, move, delete) while another action is in flight, or the project is read-only. */
  disabled: boolean;
  /**
   * Whether the project may be written to at all. The section editors use
   * this alone, not `disabled`: a save elsewhere in the table must not
   * interrupt someone typing (autosave runs quietly, ADR-0028).
   */
  writable: boolean;
  /** Opens a result a figure reference points to, in the side pane. */
  onOpenResult: (
    experimentFolder: string,
    artefactId: string,
    version: number | null,
  ) => void;
  /** The section to scroll the expanded view to, when the selection came from a search result (FR-SRC-02); `null` otherwise. */
  focusSection: RecognisedSectionKey | null;
  /** The application's one live section editor (FR-EDT-03, ADR-0043). */
  live: LiveEditor;
};

/**
 * Below the table: what can be done with the selected experiment or
 * question (edit, move, delete, rename), and the expanded view's section
 * editors for a selected experiment (S2-T12, ADR-0028).
 */
export function DetailsPanel({
  selected,
  questions,
  sharedRefs,
  actions,
  disabled,
  writable,
  onOpenResult,
  focusSection,
  live,
}: Props) {
  return (
    <section className="notebook__details" aria-labelledby="notebook-details">
      <h4 id="notebook-details">{tableMessages.detailsHeading}</h4>
      {selected === null && <p>{tableMessages.detailsHint}</p>}
      {selected?.kind === "experiment" && (
        <>
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
          <ExpandedExperimentView
            item={selected.item}
            disabled={!writable}
            onOpenResult={onOpenResult}
            focusSection={focusSection}
            live={live}
          />
        </>
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
