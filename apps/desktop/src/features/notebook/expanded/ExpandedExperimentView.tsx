import type {
  ArrangedExperiment,
  LoadedExperiment,
  RecognisedSectionKey,
} from "@research-notebook/format";
import { columnLabel, expandedMessages, messages } from "../messages";
import type { AutosaveOutcome } from "./model/autosave";
import { useAutosave, type AutosaveField } from "./model/useAutosave";
import { SectionEditor } from "./SectionEditor";
import "./ExpandedExperimentView.css";

type Props = {
  item: ArrangedExperiment;
  disabled: boolean;
  /** Autosaves one section's text (FR-EDT-03). Resolves whether it was saved. */
  onSaveSection: (
    key: RecognisedSectionKey,
    text: string,
  ) => Promise<AutosaveOutcome>;
};

function sectionText(
  experiment: LoadedExperiment,
  key: RecognisedSectionKey,
): string {
  return experiment.file.body.sections.find((s) => s.key === key)?.body ?? "";
}

/** One section's autosave field, starting from the experiment's own stored text. */
function useSectionField(
  experiment: LoadedExperiment,
  key: RecognisedSectionKey,
  onSaveSection: Props["onSaveSection"],
): AutosaveField {
  return useAutosave({
    editorKey: `${experiment.file.frontmatter.id}:${key}`,
    initial: sectionText(experiment, key),
    commit: (text) => onSaveSection(key, text),
  });
}

/**
 * The expanded experiment view (FR-TBL-07, FR-EDT-03): Methods, then Results
 * Notes and Interpretation side by side at 1280 px or more. Plain Markdown
 * text, autosaved; no rich formatting or artefact references yet (those are
 * Stage 4, ADR-0028). The side-by-side layout is CSS only; it is not
 * asserted by width here.
 */
export function ExpandedExperimentView({
  item,
  disabled,
  onSaveSection,
}: Props) {
  const { experiment, readOnly } = item;
  const methods = useSectionField(experiment, "methods", onSaveSection);
  const resultsNotes = useSectionField(
    experiment,
    "results_notes",
    onSaveSection,
  );
  const interpretation = useSectionField(
    experiment,
    "interpretation",
    onSaveSection,
  );

  if (readOnly) return <p>{messages.readOnlyItem}</p>;

  return (
    <div className="expanded" aria-labelledby="expanded-heading">
      <h5 id="expanded-heading">{expandedMessages.heading}</h5>
      <SectionEditor
        label={columnLabel("methods")}
        field={methods}
        disabled={disabled}
      />
      <div className="expanded__pair">
        <SectionEditor
          label={columnLabel("results_notes")}
          field={resultsNotes}
          disabled={disabled}
        />
        <SectionEditor
          label={columnLabel("interpretation")}
          field={interpretation}
          disabled={disabled}
        />
      </div>
    </div>
  );
}
