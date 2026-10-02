import type {
  ExperimentBodyModel,
  RecognisedSectionKey,
} from "@research-notebook/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, type FolderHandle } from "../../ipc/bindings";
import {
  memoiseRenderer,
  planLiterature,
  type LiteratureRenderer,
} from "./model/literaturePlan";
import { workerRenderer } from "./model/literatureWorker";
import { loadStyle, type StyleApi } from "./model/styleSource";
import { useSources } from "./SourcesContext";

/** The block to save with a section, or `null` to leave the block as it is. */
export type LiteratureChoice = { literature: string; basis: string } | null;

/**
 * Decides the Literature block for saving `text` as `key` of an experiment
 * whose stored body is `stored` (FR-CIT-10). May wait for the person to
 * answer the edited-block prompt. Never rejects: any failure is `null`.
 */
export type LiteraturePlanner = (
  stored: ExperimentBodyModel,
  key: RecognisedSectionKey,
  text: string,
) => Promise<LiteratureChoice>;

type Decision = "replace" | "keep";

export type LiteratureModel = {
  plan: LiteraturePlanner;
  /** Whether the person is being asked about an edited block. */
  asking: boolean;
  answer: (decision: Decision) => void;
};

type Options = {
  folder: FolderHandle;
  /** `project.yaml`'s `citation_style`; `null` before the project has loaded. */
  styleFile: string | null;
  /** Overridable for tests; defaults to the real IPC commands. */
  api?: StyleApi;
  /** Overridable for tests; defaults to the citeproc Web Worker. */
  render?: LiteratureRenderer;
};

/**
 * Plans the Literature block for each section save (FR-CIT-09, FR-CIT-10)
 * from `bibliography.json` and the project's style alone (FR-CIT-06). When
 * the stored block differs from what the app would have generated for the
 * stored text, the person is asked before it is replaced (spec 5.5 rule 6);
 * a block they chose to keep is not asked about again until it changes.
 */
export function useLiteraturePlanner({
  folder,
  styleFile,
  api = commands,
  render = workerRenderer,
}: Options): LiteratureModel {
  const { items } = useSources();
  const memoised = useMemo(() => memoiseRenderer(render), [render]);
  const latest = useRef({ items, folder, styleFile, api });
  useEffect(() => {
    latest.current = { items, folder, styleFile, api };
  });
  const kept = useRef(new Set<string>());
  const [waiting, setWaiting] = useState<((d: Decision) => void) | null>(null);

  const ask = useCallback(
    () =>
      new Promise<Decision>((resolve) => {
        setWaiting(() => (decision: Decision) => {
          setWaiting(null);
          resolve(decision);
        });
      }),
    [],
  );

  const plan = useCallback<LiteraturePlanner>(
    async (stored, key, text) => {
      try {
        const current = latest.current;
        const style = await loadStyle(
          current.api,
          current.folder,
          current.styleFile,
        );
        const result = await planLiterature(
          { render: memoised, items: current.items, ...style },
          stored,
          key,
          text,
        );
        if (result.kind === "none") return null;
        const { literature, basis } = result;
        if (result.kind === "edited") {
          if (
            stored.literature !== null &&
            kept.current.has(stored.literature)
          ) {
            return null;
          }
          if ((await ask()) === "keep") {
            if (stored.literature !== null) kept.current.add(stored.literature);
            return null;
          }
        }
        return { literature, basis };
      } catch {
        return null;
      }
    },
    [memoised, ask],
  );

  const answer = useCallback(
    (decision: Decision) => waiting?.(decision),
    [waiting],
  );

  return { plan, asking: waiting !== null, answer };
}
