import type {
  ArrangedExperiment,
  ArrangedQuestion,
  RecognisedSectionKey,
} from "@research-notebook/format";
import type { FolderHandle } from "../../ipc/bindings";
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
  /** The open project, so the expanded view can read an experiment's artefacts.yaml (FR-EDT-04). */
  folder: FolderHandle;
  /** `project.yaml`'s own id, for a reference chip's preview (FR-EDT-06); `null` before the project has loaded. */
  projectId: string | null;
  /** The section to open the expanded view at, when the selection came from a search result (FR-SRC-02); `null` otherwise. */
  focusSection: RecognisedSectionKey | null;
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
  folder,
  projectId,
  focusSection,
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
            folder={folder}
            projectId={projectId}
            focusSection={focusSection}
            onSaveSection={(key, text) =>
              actions.editExperimentSection(
                selected.item.experiment.file.frontmatter.id,
                key,
                text,
              )
            }
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
