import type {
  ArrangedExperiment,
  RecognisedSectionKey,
} from "@research-notebook/format";
import { useEffect, useRef, useState } from "react";
import {
  isLiveIn,
  liveKey,
  sectionText,
  type LiveTarget,
  type Surface,
} from "../editing/model/liveEditor";
import type { LiveEditor } from "../editing/useLiveEditor";
import { columnLabel, expandedMessages, messages } from "../messages";
import { evidenceOf } from "../model/evidence";
import type { AutosaveField } from "./model/useAutosave";
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
  /** Opens a referenced result in the side pane. */
  onOpenResult: (
    experimentFolder: string,
    artefactId: string,
    version: number | null,
  ) => void;
  /** Scrolls this section into view, when the experiment was opened from a search result (FR-SRC-02); `null` otherwise. */
  focusSection: RecognisedSectionKey | null;
  /** The application's one live section editor and its autosave (FR-EDT-03, ADR-0043). */
  live: LiveEditor;
  /** Where this copy is shown. A section is live only on the surface that asked for it, so two copies never both edit. */
  surface?: Surface;
  /** Stack Results notes and Interpretation whatever the window's width, for a narrow panel. */
  stacked?: boolean;
};

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
  onOpenResult,
  focusSection,
  live,
  surface = "details",
  stacked = false,
}: Props) {
  const { experiment, readOnly } = item;
  const experimentId = experiment.file.frontmatter.id;
  const artefacts = evidenceOf(item);

  // Tracking which experiment and search result are shown, without an
  // effect (React's documented pattern for state that must follow a prop):
  // https://react.dev/learn/you-might-not-need-an-effect
  const [trackedExperimentId, setTrackedExperimentId] = useState(experimentId);
  const [trackedFocusSection, setTrackedFocusSection] = useState(focusSection);
  if (
    trackedExperimentId !== experimentId ||
    trackedFocusSection !== focusSection
  ) {
    setTrackedExperimentId(experimentId);
    setTrackedFocusSection(focusSection);
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
      surface,
    };
    const isLive = isLiveIn(live.target, experiment.folder, key, surface);
    return {
      label: columnLabel(key),
      editorKey: liveKey(here),
      initialMarkdown: sectionText(experiment, key),
      field: isLive ? live.field : STATIC_FIELD,
      disabled,
      live: isLive,
      onActivate: () => void live.activate(here),
      artefacts,
      // A figure reference opens that result in the side pane, never full size.
      onActivateReference: (ulid: string, version: number | null) =>
        onOpenResult(experiment.folder, ulid, version),
      // FR-CIT-09: Methods, then Interpretation; never Results Notes.
      allowCitations: key !== "results_notes",
      containerRef: (element: HTMLDivElement | null) => {
        sectionElements.current[key] = element;
      },
    };
  };

  return (
    <div
      className={`expanded${stacked ? " expanded--stacked" : ""}`}
      aria-labelledby="expanded-heading"
    >
      <h5 id="expanded-heading">{expandedMessages.heading}</h5>
      <RichSectionEditor {...sectionProps("methods")} />
      <div className="expanded__pair">
        <RichSectionEditor {...sectionProps("results_notes")} />
        <RichSectionEditor {...sectionProps("interpretation")} />
      </div>
    </div>
  );
}
