import { linkedFilesList, type Arranged } from "@research-notebook/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BundleChoice,
  BundleResult,
  BundleSummary,
} from "../../ipc/bindings";
import {
  bundleStem,
  planBundle,
  writeBundle,
  type BundleApi,
  type BundleFailure,
} from "./model/bundle";

/** What the panel shows for one kind of bundle. */
export type BundleChoiceModel = {
  /** `null` while counting, or when the count failed (see `planFailed`). */
  plan: BundleSummary | null;
  planFailed: boolean;
  /** The last attempt, or `null` if none or the person cancelled. */
  result: BundleResult | null;
  failure: BundleFailure | null;
  cancelled: boolean;
};

/** What the bundle panel shows: both kinds, and which one is being saved. */
export type BundleModel = {
  choices: Record<BundleChoice, BundleChoiceModel>;
  /** The kind being saved, or `null`. Only one runs at a time. */
  running: BundleChoice | null;
  /** The archive would leave linked files out, and says so. */
  hasLinkedFiles: boolean;
  save: (choice: BundleChoice) => void;
};

type Options = {
  api: BundleApi;
  folder: number;
  arranged: Arranged | null;
  /** The project's name, for the file name offered. */
  projectName: string | null;
};

const EMPTY: BundleChoiceModel = {
  plan: null,
  planFailed: false,
  result: null,
  failure: null,
  cancelled: false,
};

const CHOICES: readonly BundleChoice[] = ["notebook", "archive"];

/**
 * Counts what each bundle would hold, then saves one on request (FR-ARC-08).
 * Never runs by itself. Needs no write access: the project is only read.
 */
export function useBundle(options: Options): BundleModel {
  const [choices, setChoices] = useState<
    Record<BundleChoice, BundleChoiceModel>
  >({ notebook: EMPTY, archive: EMPTY });
  const [running, setRunning] = useState<BundleChoice | null>(null);
  const latest = useRef(options);
  latest.current = options;
  const { api, folder } = options;
  const ready = options.arranged !== null;

  const patch = useCallback(
    (choice: BundleChoice, change: Partial<BundleChoiceModel>) =>
      setChoices((current) => ({
        ...current,
        [choice]: { ...current[choice], ...change },
      })),
    [],
  );

  useEffect(() => {
    if (!ready) return;
    let current = true;
    for (const choice of CHOICES) {
      void planBundle({ api, folder, choice }).then((result) => {
        if (!current) return;
        patch(choice, {
          plan: result.ok ? result.value : null,
          planFailed: !result.ok,
        });
      });
    }
    return () => {
      current = false;
    };
  }, [api, folder, ready, patch]);

  const save = useCallback(
    (choice: BundleChoice) => {
      const { api, folder, arranged, projectName } = latest.current;
      if (arranged === null) return;
      setRunning(choice);
      patch(choice, { result: null, failure: null, cancelled: false });
      void writeBundle({
        api,
        folder,
        choice,
        stem: bundleStem(projectName ?? "", choice),
        arranged,
      })
        .then((result) =>
          patch(
            choice,
            result.ok
              ? { result: result.value, cancelled: result.value === null }
              : { failure: result.error },
          ),
        )
        .catch(() => patch(choice, { failure: "writeFailed" }))
        .finally(() => setRunning(null));
    },
    [patch],
  );

  const hasLinkedFiles = useMemo(
    () =>
      options.arranged !== null && linkedFilesList(options.arranged) !== null,
    [options.arranged],
  );

  return { choices, running, hasLinkedFiles, save };
}
