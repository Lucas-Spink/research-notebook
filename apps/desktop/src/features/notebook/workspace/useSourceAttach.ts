import type {
  ArrangedExperiment,
  RecognisedSectionKey,
} from "@research-notebook/format";
import { useMemo, useState } from "react";
import type { AttachModel } from "../../citations";
import type { LiveEditor } from "../editing/useLiveEditor";
import {
  attachEdits,
  attachMarkdownEdits,
  attachedCitekeys,
  detachEdits,
  type SectionEdit,
} from "./model/attach";

type Options = {
  /** The selected experiment; sources can be attached only to an experiment that can be written. */
  item: ArrangedExperiment | null;
  live: LiveEditor;
  writable: boolean;
  /** Saves one section, rendering Literature in the same write. Resolves whether it was saved. */
  save: (
    id: string,
    section: RecognisedSectionKey,
    text: string,
  ) => Promise<{ ok: boolean }>;
  /** Caches the cited sources in `bibliography.json` (FR-CIT-05). */
  sync: (citekeys: readonly string[]) => void;
};

export type SourceAttach = {
  /** For the Sources list, or `undefined` when no experiment can take a source. */
  model: AttachModel | undefined;
  /** Attaches the citation text the picker composed, and caches its sources. Resolves whether it was saved. */
  attachPicked: (
    markdown: string,
    citekeys: readonly string[],
  ) => Promise<boolean>;
  /** The last attach or detach failed, and nothing was changed by it. */
  failed: boolean;
};

/**
 * Attaching and detaching sources for the selected experiment (S6-T01). A
 * source is attached by a citation in the experiment's text, so both save
 * ordinary section edits through the same path as typing does, after the
 * live editor has saved and closed so its pending text is not overwritten.
 */
export function useSourceAttach({
  item,
  live,
  writable,
  save,
  sync,
}: Options): SourceAttach {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const front = item?.experiment.file.frontmatter;
  const body = item?.experiment.file.body;
  const attached = useMemo(
    () => (body === undefined ? new Set<string>() : attachedCitekeys(body)),
    [body],
  );
  const canEdit =
    writable && item !== undefined && item !== null && !item.readOnly;

  async function apply(edits: SectionEdit[]): Promise<boolean> {
    if (front === undefined || edits.length === 0) return edits.length === 0;
    setBusy(true);
    setFailed(false);
    try {
      if (!(await live.activate(null))) {
        setFailed(true);
        return false;
      }
      for (const edit of edits) {
        const outcome = await save(front.id, edit.key, edit.text);
        if (!outcome.ok) {
          setFailed(true);
          return false;
        }
      }
      return true;
    } finally {
      setBusy(false);
    }
  }

  if (!canEdit || front === undefined || body === undefined) {
    return {
      model: undefined,
      failed,
      attachPicked: () => Promise.resolve(false),
    };
  }
  return {
    failed,
    model: {
      target: front.ref,
      attached,
      busy,
      onAttach: (citekey) => {
        void apply(attachEdits(body, citekey)).then((saved) => {
          if (saved) sync([citekey]);
        });
      },
      onDetach: (citekey) => void apply(detachEdits(body, citekey)),
    },
    attachPicked: async (markdown, citekeys) => {
      const saved = await apply(attachMarkdownEdits(body, markdown));
      if (saved) sync(citekeys);
      return saved;
    },
  };
}
