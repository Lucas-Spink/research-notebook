import type { Arranged, RecognisedSectionKey } from "@research-notebook/format";
import { useCallback, useRef, useState } from "react";
import type { AutosaveOutcome } from "../expanded/model/autosave";
import { useAutosave, type AutosaveField } from "../expanded/model/useAutosave";
import {
  editableExperiment,
  liveKey,
  sectionText,
  type LiveTarget,
} from "./model/liveEditor";

type Options = {
  arranged: Arranged | null;
  /** Saves one section's text. Resolves whether it was saved. */
  save: (
    experimentId: string,
    section: RecognisedSectionKey,
    text: string,
  ) => Promise<AutosaveOutcome>;
};

export type LiveEditor = {
  /** The live section, or `null` when none is (or its experiment is gone or read-only). */
  target: LiveTarget | null;
  /** The live section's autosave. */
  field: AutosaveField;
  /**
   * Makes `next` the live section once the current one's text is saved.
   * When that save fails the current section stays live, showing its error,
   * unless `force` is set, as it is for a new selection. When asked again
   * before a save settles, only the latest request is kept. Resolves
   * whether `next` became live.
   */
  activate: (
    next: LiveTarget | null,
    options?: { force?: boolean },
  ) => Promise<boolean>;
};

/**
 * The one live section editor for the whole application (FR-EDT-03,
 * ADR-0043), with the one autosave behind it. It lives above anything that
 * shows an editor, so an editor being unmounted never loses what was typed,
 * and switching saves first instead of waiting for blur or the debounce.
 */
export function useLiveEditor({ arranged, save }: Options): LiveEditor {
  const [requested, setRequested] = useState<LiveTarget | null>(null);
  const item =
    requested === null
      ? undefined
      : editableExperiment(arranged, requested.folder);
  const target = item === undefined ? null : requested;

  const { field, isSettled, settle } = useAutosave({
    editorKey: liveKey(target),
    initial:
      item === undefined || target === null
        ? ""
        : sectionText(item.experiment, target.section),
    commit: (text) =>
      item === undefined || target === null
        ? Promise.resolve({ ok: true })
        : save(item.experiment.file.frontmatter.id, target.section, text),
  });

  const latestAsk = useRef<LiveTarget | null>(null);
  const activate = useCallback<LiveEditor["activate"]>(
    async (next, { force = false } = {}) => {
      latestAsk.current = next;
      if (isSettled()) {
        setRequested(next);
        return true;
      }
      const saved = await settle();
      if (latestAsk.current !== next || (!saved && !force)) return false;
      setRequested(next);
      return true;
    },
    [isSettled, settle],
  );

  return { target, field, activate };
}
