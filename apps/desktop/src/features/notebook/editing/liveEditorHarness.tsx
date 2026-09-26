import type {
  ArrangedExperiment,
  RecognisedSectionKey,
} from "@research-notebook/format";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { AutosaveOutcome } from "../expanded/model/autosave";
import type { LiveTarget } from "./model/liveEditor";
import { useLiveEditor, type LiveEditor } from "./useLiveEditor";

type Props = {
  /** The experiments the live editor can find, as if unassigned. */
  items: ArrangedExperiment[];
  /** The section made live on mount, as a selection would. */
  initial: LiveTarget | null;
  save?: (
    experimentId: string,
    section: RecognisedSectionKey,
    text: string,
  ) => Promise<AutosaveOutcome>;
  children: (live: LiveEditor) => ReactNode;
};

const savedAlways = () => Promise.resolve<AutosaveOutcome>({ ok: true });

/**
 * For tests: the one live editor `NotebookView` owns, around a component
 * that shows editors, with a section made live once on mount.
 */
export function LiveEditorHarness({
  items,
  initial,
  save = savedAlways,
  children,
}: Props) {
  const arranged = useMemo(
    () => ({ questions: [], unassigned: items, problems: [] }),
    [items],
  );
  const live = useLiveEditor({ arranged, save });
  const { activate } = live;
  // Kept from the first render, so it opens once, like the selection that opens a view.
  const [opened] = useState(initial);
  useEffect(() => {
    void activate(opened, { force: true });
  }, [activate, opened]);
  return <>{children(live)}</>;
}
