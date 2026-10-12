import { arrangeNotebook, type Arranged } from "@research-notebook/format";
import { useEffect, useRef, useState } from "react";
import { commands, type FolderHandle } from "../../../ipc/bindings";
import type { ReadApi } from "../model/api";
import { loadNotebook } from "../model/load";
import { subscribe, type CanvasWindowApi } from "./api";
import { reloadsNotebook } from "./model/changes";

/** How long file changes are collected before the notebook is read again. */
const RELOAD_DELAY_MS = 300;

/** What the canvas window has to show. */
export type CanvasWindowProject =
  | { status: "loading" }
  /** The window was not opened by the main window, so there is no project. */
  | { status: "unavailable" }
  /** The project could not be read at all. */
  | { status: "failed" }
  | {
      status: "ready";
      folder: FolderHandle;
      /** The main window holds the project lock and this window does not take it; false means read-only. */
      writable: boolean;
      projectId: string;
      arranged: Arranged;
    };

type Options = {
  api: CanvasWindowApi;
  read?: ReadApi;
  /** Only tests set this. */
  debounceMs?: number;
};

/**
 * The project the pop-out canvas window shows (ADR-0066). The main window
 * opens the project, holds its lock and polls the watcher; this window only
 * reads the notebook, to draw cards and list results, and reads it again when
 * the main window relays a change to a question or experiment. It never
 * writes a notebook file: the canvas's own files are saved by `useCanvases`.
 */
export function useCanvasWindowProject({
  api,
  read = commands,
  debounceMs = RELOAD_DELAY_MS,
}: Options): CanvasWindowProject {
  const [state, setState] = useState<CanvasWindowProject>({
    status: "loading",
  });
  const [target, setTarget] = useState<{
    folder: FolderHandle;
    writable: boolean;
  } | null>(null);

  useEffect(() => {
    let stale = false;
    api
      .context()
      .then((context) => {
        if (stale) return;
        if (context === null) setState({ status: "unavailable" });
        else setTarget({ folder: context.folder, writable: context.writable });
      })
      .catch(() => {
        if (!stale) setState({ status: "unavailable" });
      });
    return () => {
      stale = true;
    };
  }, [api]);

  // Reads that overlap are numbered, so only the newest one is shown.
  const latest = useRef(0);
  useEffect(() => {
    if (target === null) return;
    const { folder, writable } = target;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    async function load(first: boolean) {
      const number = ++latest.current;
      const outcome = await loadNotebook(read, folder).catch(() => null);
      if (stopped || number !== latest.current) return;
      if (outcome?.ok !== true) {
        // A failed reload keeps what is showing; only the first read has nothing to fall back on.
        if (first) setState({ status: "failed" });
        return;
      }
      setState({
        status: "ready",
        folder,
        writable,
        projectId: outcome.value.state.project.id,
        arranged: arrangeNotebook(outcome.value.state),
      });
    }

    void load(true);
    const unsubscribe = subscribe(
      api.onFilesChanged((change) => {
        if (!reloadsNotebook(change)) return;
        if (timer !== null) clearTimeout(timer);
        timer = setTimeout(() => void load(false), debounceMs);
      }),
    );
    return () => {
      stopped = true;
      if (timer !== null) clearTimeout(timer);
      unsubscribe();
    };
  }, [api, read, target, debounceMs]);

  return state;
}
