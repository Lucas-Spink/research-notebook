import type {
  ArrangedExperiment,
  RecognisedSectionKey,
  ReferenceIndex,
} from "@research-notebook/format";
import { useEffect, useRef, useState } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import { commands } from "../../../ipc/bindings";
import {
  isLiveIn,
  liveKey,
  sectionText,
  type LiveTarget,
} from "../editing/model/liveEditor";
import type { LiveEditor } from "../editing/useLiveEditor";
import { columnLabel, expandedMessages, messages } from "../messages";
import { evidenceOf } from "../model/evidence";
import type { AutosaveField } from "./model/useAutosave";
import { ReferencePreviewOverlay } from "./ReferencePreviewOverlay";
import { RichSectionEditor } from "./RichSectionEditor";
import "./ExpandedExperimentView.css";

/** A section that is not live shows its stored text, which is saved by definition. */
const STATIC_FIELD: AutosaveField = {
  text: "",
  status: "saved",
  message: null,
  onChange: () => undefined,
  onBlur: () => undefined,
};

type Props = {
  item: ArrangedExperiment;
  disabled: boolean;
  /** The open project, so the @ autocomplete can read this experiment's artefacts.yaml (FR-EDT-04). */
  folder: FolderHandle;
  /** `project.yaml`'s own id, for the reference preview's external root lookups (FR-PRJ-07); `null` before the project has loaded. */
  projectId: string | null;
  /** Every experiment and section that references an artefact, across the
   * whole project (FR-SRC-03), for the reference preview's "Referenced in" list. */
  references: ReferenceIndex;
  /** Scrolls this section into view, when the experiment was opened from a search result (FR-SRC-02); `null` otherwise. */
  focusSection: RecognisedSectionKey | null;
  /** The application's one live section editor and its autosave (FR-EDT-03, ADR-0043). */
  live: LiveEditor;
};

/** A reference chip's activation (FR-EDT-06), waiting to open its preview. */
type OpenReference = { ulid: string; version: number | null };

/**
 * The expanded experiment view (FR-TBL-07, FR-EDT-01 to FR-EDT-03): Methods,
 * then Results Notes and Interpretation side by side at 1280 px or more.
 * Formatted text with passthrough blocks for unsupported Markdown
 * (ADR-0028). A section is live only when it is the application's one live
 * section (`live`, ADR-0043); every other section shows a static, read-only
 * rendering that asks for it to become live. The side-by-side layout is CSS
 * only; it is not asserted by width here.
 */
export function ExpandedExperimentView({
  item,
  disabled,
  folder,
  projectId,
  references,
  focusSection,
  live,
}: Props) {
  const { experiment, readOnly } = item;
  const experimentId = experiment.file.frontmatter.id;
  const artefacts = evidenceOf(item);

  // Closing an open reference preview when a different experiment is
  // selected, or a new search result is opened, without an effect (React's
  // documented pattern for state that must reset when a prop changes):
  // https://react.dev/learn/you-might-not-need-an-effect
  const [trackedExperimentId, setTrackedExperimentId] = useState(experimentId);
  const [trackedFocusSection, setTrackedFocusSection] = useState(focusSection);
  const [openReference, setOpenReference] = useState<OpenReference | null>(
    null,
  );
  if (
    trackedExperimentId !== experimentId ||
    trackedFocusSection !== focusSection
  ) {
    setTrackedExperimentId(experimentId);
    setTrackedFocusSection(focusSection);
    setOpenReference(null);
  }

  // Scrolls to the requested section once it is the live one (FR-SRC-02);
  // re-runs only when a new search result is actually opened, not on every
  // render, since `trackedFocusSection` only changes then.
  const sectionElements = useRef<
    Partial<Record<RecognisedSectionKey, HTMLDivElement | null>>
  >({});
  useEffect(() => {
    if (trackedFocusSection === null) return;
    // Optional call, not just optional access: jsdom (the test environment)
    // does not implement scrollIntoView at all.
    sectionElements.current[trackedFocusSection]?.scrollIntoView?.({
      block: "center",
    });
  }, [trackedExperimentId, trackedFocusSection]);

  if (readOnly) return <p>{messages.readOnlyItem}</p>;

  const sectionProps = (key: RecognisedSectionKey) => {
    const here: LiveTarget = {
      folder: experiment.folder,
      section: key,
      surface: "details",
    };
    const isLive = isLiveIn(live.target, experiment.folder, key, "details");
    return {
      label: columnLabel(key),
      editorKey: liveKey(here),
      initialMarkdown: sectionText(experiment, key),
      field: isLive ? live.field : STATIC_FIELD,
      disabled,
      live: isLive,
      onActivate: () => void live.activate(here),
      artefacts,
      onActivateReference: (ulid: string, version: number | null) =>
        setOpenReference({ ulid, version }),
      containerRef: (element: HTMLDivElement | null) => {
        sectionElements.current[key] = element;
      },
    };
  };

  return (
    <div className="expanded" aria-labelledby="expanded-heading">
      <h5 id="expanded-heading">{expandedMessages.heading}</h5>
      <RichSectionEditor {...sectionProps("methods")} />
      <div className="expanded__pair">
        <RichSectionEditor {...sectionProps("results_notes")} />
        <RichSectionEditor {...sectionProps("interpretation")} />
      </div>
      {openReference !== null && artefacts !== null && projectId !== null && (
        <ReferencePreviewOverlay
          api={commands}
          folder={folder}
          projectId={projectId}
          experimentFolder={experiment.folder}
          file={artefacts}
          artefactId={openReference.ulid}
          version={openReference.version}
          references={references}
          onClose={() => setOpenReference(null)}
        />
      )}
    </div>
  );
}
