import type { SourceReplacement } from "@research-notebook/format";
import { useCallback, useEffect, useRef, useState } from "react";
import { commands, type FolderHandle } from "../../ipc/bindings";
import type { NotebookState } from "@research-notebook/format";
import { repairMessages, repairedText, sourcesMessages } from "./messages";
import type { LiteratureRenderer } from "./model/literaturePlan";
import { workerRenderer } from "./model/literatureWorker";
import {
  repairSource,
  type RepairEnv,
  type RepairOutcome,
} from "./model/sourceRepair";
import { useSources } from "./SourcesContext";

export type RepairModel = {
  /** The citekey whose replacement is being chosen; `null` when none. */
  choosing: string | null;
  busy: boolean;
  /** The result of the last attempt, for a status region. */
  message: string | null;
  /** Whether a source in this state can be replaced here: missing or trashed, in a writable project. */
  canReplace: (status: "ok" | "trashed" | "missing") => boolean;
  start: (citekey: string) => void;
  cancel: () => void;
  /** Replaces the source being chosen with `replacement`, a citekey. */
  choose: (replacement: string) => void;
};

type Options = {
  folder: FolderHandle;
  /** The project as loaded; `null` before it has. */
  state: NotebookState | null;
  writable: boolean;
  /** Saves the replacement as one plan; resolves whether it was saved. */
  apply: (change: SourceReplacement) => Promise<boolean>;
  /** Overridable for tests; defaults to the real IPC commands. */
  api?: RepairEnv["api"];
  /** Overridable for tests; defaults to the citeproc Web Worker. */
  render?: LiteratureRenderer;
  now?: () => Date;
};

const systemNow = () => new Date();

function outcomeText(outcome: RepairOutcome): string {
  switch (outcome.kind) {
    case "replaced":
      return repairedText(outcome.experiments, outcome.keptEdited);
    case "notRepairable":
      return repairMessages.notRepairable;
    case "notCited":
      return repairMessages.notCited;
    case "notUsable":
      return repairMessages.notUsable;
    case "offline":
      return outcome.reason === "notRunning"
        ? sourcesMessages.offlineNotRunning
        : sourcesMessages.offlineDisabled;
    case "unreadable":
      return sourcesMessages.unreadable;
    case "notWritable":
      return sourcesMessages.notWritable;
    case "changed":
      return sourcesMessages.changed;
    case "failed":
      return repairMessages.failed;
  }
}

/**
 * Choosing a replacement for a missing or trashed source (FR-CIT-08). The
 * checks, the fetch and the plan are in `repairSource`; this holds the
 * choice in progress and the status.
 */
export function useSourceRepair({
  folder,
  state,
  writable,
  apply,
  api = commands,
  render = workerRenderer,
  now = systemNow,
}: Options): RepairModel {
  const { items, adopt } = useSources();
  const [choosing, setChoosing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const latest = useRef({ state, items, apply, api, render, now, folder });
  useEffect(() => {
    latest.current = { state, items, apply, api, render, now, folder };
  });

  const choose = useCallback(
    (replacement: string) => {
      const from = choosing;
      const current = latest.current;
      if (from === null || current.state === null) return;
      setChoosing(null);
      setBusy(true);
      setMessage(repairMessages.working);
      void repairSource({ ...current, state: current.state }, from, replacement)
        .then((outcome) => {
          if (outcome.kind === "replaced") adopt(outcome.bibliography);
          setMessage(outcomeText(outcome));
        })
        .finally(() => setBusy(false));
    },
    [choosing, adopt],
  );

  return {
    choosing,
    busy,
    message,
    canReplace: (status) => writable && !busy && status !== "ok",
    start: setChoosing,
    cancel: () => setChoosing(null),
    choose,
  };
}
