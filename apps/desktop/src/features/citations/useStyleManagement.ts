import { BUNDLED_STYLES, MAX_STYLE_BYTES } from "@research-notebook/citations";
import type {
  CitationStyleChange,
  NotebookState,
} from "@research-notebook/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, type FolderHandle } from "../../ipc/bindings";
import { styleChangedText, styleMessages, styleProblemText } from "./messages";
import type { LiteratureRenderer } from "./model/literaturePlan";
import { workerRenderer } from "./model/literatureWorker";
import {
  chooseStyle,
  type StyleChoice,
  type StyleOutcome,
} from "./model/styleManagement";
import type { StyleApi } from "./model/styleSource";
import { useSources } from "./SourcesContext";

export type StyleOption = { file: string; label: string };

export type StyleModel = {
  /** The bundled styles, plus the project's current style when it is not one of them. */
  options: readonly StyleOption[];
  /** `citation_style`; `null` before the project has loaded. */
  activeFile: string | null;
  /** The named style file is not in `styles/`, so the bundled numeric style is used. */
  usingDefault: boolean;
  writable: boolean;
  busy: boolean;
  /** The result of the last change, for a status region. */
  message: string | null;
  choose: (file: string) => void;
  importFile: (file: File) => void;
};

type Options = {
  folder: FolderHandle;
  /** The project as loaded; `null` before it has. */
  state: NotebookState | null;
  writable: boolean;
  /** Saves a style change as one plan; resolves whether it was saved. */
  apply: (change: CitationStyleChange) => Promise<boolean>;
  /** Overridable for tests; defaults to the real IPC commands. */
  api?: StyleApi;
  /** Overridable for tests; defaults to the citeproc Web Worker. */
  render?: LiteratureRenderer;
};

function outcomeText(outcome: StyleOutcome): string {
  switch (outcome.kind) {
    case "changed":
      return styleChangedText(outcome.keptEdited);
    case "refused":
      return styleProblemText(outcome.problem);
    case "failed":
      return styleMessages.failed;
  }
}

/**
 * Choosing and importing the project's citation style (FR-CIT-11). The
 * checks and the plan are in `chooseStyle`; this holds the status and reads
 * the file the person picks.
 */
export function useStyleManagement({
  folder,
  state,
  writable,
  apply,
  api = commands,
  render = workerRenderer,
}: Options): StyleModel {
  const { items } = useSources();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [usingDefault, setUsingDefault] = useState(false);
  const activeFile = state?.project.citation_style ?? null;
  const latest = useRef({ state, items, apply, api, render, folder });
  useEffect(() => {
    latest.current = { state, items, apply, api, render, folder };
  });

  useEffect(() => {
    if (activeFile === null) return;
    let current = true;
    void api
      .readNotebookFile(folder, `_notebook/styles/${activeFile}`)
      .then((read) => {
        if (current) {
          setUsingDefault(read.status === "ok" && read.data.kind === "missing");
        }
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, [api, folder, activeFile]);

  const run = useCallback(async (choice: StyleChoice) => {
    const now = latest.current;
    if (now.state === null) return;
    setBusy(true);
    setMessage(styleMessages.working);
    try {
      const outcome = await chooseStyle(
        {
          api: now.api,
          folder: now.folder,
          state: now.state,
          items: now.items,
          render: now.render,
          apply: now.apply,
        },
        choice,
      );
      setMessage(outcomeText(outcome));
    } finally {
      setBusy(false);
    }
  }, []);

  const choose = useCallback(
    (file: string) => void run({ kind: "bundled", file }),
    [run],
  );

  const importFile = useCallback(
    (file: File) => {
      if (file.size > MAX_STYLE_BYTES) {
        setMessage(styleMessages.tooLarge);
        return;
      }
      void file
        .text()
        .then((text) => run({ kind: "imported", fileName: file.name, text }))
        .catch(() => setMessage(styleMessages.failed));
    },
    [run],
  );

  const options = useMemo<StyleOption[]>(() => {
    const bundled = BUNDLED_STYLES.map((s) => ({
      file: s.file,
      label: s.title,
    }));
    const extra =
      activeFile !== null && !bundled.some((o) => o.file === activeFile)
        ? [
            {
              file: activeFile,
              label: `${activeFile} ${styleMessages.currentSuffix}`,
            },
          ]
        : [];
    return [...extra, ...bundled];
  }, [activeFile]);

  return {
    options,
    activeFile,
    usingDefault,
    writable,
    busy,
    message,
    choose,
    importFile,
  };
}
