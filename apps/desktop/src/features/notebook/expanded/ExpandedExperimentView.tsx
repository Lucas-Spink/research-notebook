import type {
  ArrangedExperiment,
  LoadedExperiment,
  RecognisedSectionKey,
} from "@research-notebook/format";
import { useState } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import { commands } from "../../../ipc/bindings";
import { columnLabel, expandedMessages, messages } from "../messages";
import { useExperimentArtefacts } from "./model/useExperimentArtefacts";
import type { AutosaveOutcome } from "./model/autosave";
import { useAutosave, type AutosaveField } from "./model/useAutosave";
import { RichSectionEditor } from "./RichSectionEditor";
import "./ExpandedExperimentView.css";

type Props = {
  item: ArrangedExperiment;
  disabled: boolean;
  /** The open project, so the @ autocomplete can read this experiment's artefacts.yaml (FR-EDT-04). */
  folder: FolderHandle;
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

function editorKey(
  experiment: LoadedExperiment,
  key: RecognisedSectionKey,
): string {
  return `${experiment.file.frontmatter.id}:${key}`;
}

/** One section's autosave field, starting from the experiment's own stored text. */
function useSectionField(
  experiment: LoadedExperiment,
  key: RecognisedSectionKey,
  onSaveSection: Props["onSaveSection"],
): AutosaveField {
  return useAutosave({
    editorKey: editorKey(experiment, key),
    initial: sectionText(experiment, key),
    commit: (text) => onSaveSection(key, text),
  });
}

const DEFAULT_LIVE_SECTION: RecognisedSectionKey = "methods";

/**
 * The expanded experiment view (FR-TBL-07, FR-EDT-01 to FR-EDT-03): Methods,
 * then Results Notes and Interpretation side by side at 1280 px or more.
 * Formatted text with passthrough blocks for unsupported Markdown
 * (ADR-0028, this task). Only one of the three mounts a live editor
 * instance at a time (S4-G08); the other two show a static, read-only
 * rendering that activates it. The side-by-side layout is CSS only; it is
 * not asserted by width here.
 */
export function ExpandedExperimentView({
  item,
  disabled,
  folder,
  onSaveSection,
}: Props) {
  const { experiment, readOnly } = item;
  const experimentId = experiment.file.frontmatter.id;
  const artefacts = useExperimentArtefacts(commands, folder, experiment.folder);

  // Resetting to the default live section when a different experiment is
  // selected, without an effect (React's documented pattern for state that
  // must reset when a prop changes): https://react.dev/learn/you-might-not-need-an-effect
  const [trackedExperimentId, setTrackedExperimentId] = useState(experimentId);
  const [live, setLive] = useState<RecognisedSectionKey>(DEFAULT_LIVE_SECTION);
  if (trackedExperimentId !== experimentId) {
    setTrackedExperimentId(experimentId);
    setLive(DEFAULT_LIVE_SECTION);
  }

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

  const sectionProps = (key: RecognisedSectionKey, field: AutosaveField) => ({
    label: columnLabel(key),
    editorKey: editorKey(experiment, key),
    initialMarkdown: sectionText(experiment, key),
    field,
    disabled,
    live: live === key,
    onActivate: () => setLive(key),
    artefacts,
  });

  return (
    <div className="expanded" aria-labelledby="expanded-heading">
      <h5 id="expanded-heading">{expandedMessages.heading}</h5>
      <RichSectionEditor {...sectionProps("methods", methods)} />
      <div className="expanded__pair">
        <RichSectionEditor {...sectionProps("results_notes", resultsNotes)} />
        <RichSectionEditor
          {...sectionProps("interpretation", interpretation)}
        />
      </div>
    </div>
  );
}
