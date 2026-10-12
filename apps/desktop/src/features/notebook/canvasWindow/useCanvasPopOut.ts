import { useCallback, useEffect, useRef, useState } from "react";
import type { FolderHandle } from "../../../ipc/bindings";
import { popOutApi, subscribe, type PopOutApi } from "./api";
import { touchesBibliography, touchesCanvases } from "./model/changes";

/** What the main window knows about the pop-out canvas window. */
export type PopOut = {
  /** The canvas is in its own window, which is then the only one that edits it. */
  open: boolean;
  /** The last attempt to open the window failed. */
  failed: boolean;
  /** Opens the canvas window, or brings it to the front if it is open. */
  popOut: () => Promise<void>;
};

type Options = {
  api?: PopOutApi;
  folder: FolderHandle;
  /** Whether this window holds the project lock; the canvas window follows it. */
  writable: boolean;
  /**
   * Makes the main window ready to give up the canvas: whatever is being typed
   * is saved, canvas edits are written and the table is showing. Resolves
   * `false` if that could not be done, and then the window is not opened.
   */
  beforeOpen: () => Promise<boolean>;
  /** The canvas window went away; the canvas files may have changed meanwhile. */
  onClosed: () => void;
  /** A canvas file changed while the canvas window is open. */
  onCanvasFilesChanged: () => void;
  /** The cached sources changed while the canvas window is open, perhaps by a citation inserted there. */
  onBibliographyChanged: () => void;
  /** The canvas window asked for a result's original to be opened in the table. */
  onOpenResult: (
    experimentFolder: string,
    artefactId: string,
    version: number | null,
  ) => void;
};

/**
 * The main window's side of the pop-out canvas (ADR-0066). The canvas window
 * is created and closed by Rust; this follows it through events, so the
 * answer is right however the window was closed, and closes it with the
 * project, since the window belongs to that project.
 */
export function useCanvasPopOut({
  api = popOutApi,
  folder,
  writable,
  beforeOpen,
  onClosed,
  onCanvasFilesChanged,
  onBibliographyChanged,
  onOpenResult,
}: Options): PopOut {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);

  // The latest callbacks and state, without listening again whenever they change.
  const latest = useRef({
    onClosed,
    onCanvasFilesChanged,
    onBibliographyChanged,
    onOpenResult,
    open,
  });
  latest.current = {
    onClosed,
    onCanvasFilesChanged,
    onBibliographyChanged,
    onOpenResult,
    open,
  };

  useEffect(() => {
    const stops = [
      subscribe(
        api.onChanged((now) => {
          const was = latest.current.open;
          // Set now, so a file change that follows is judged against the new state.
          latest.current.open = now;
          setOpen(now);
          if (was && !now) latest.current.onClosed();
        }),
      ),
      subscribe(
        api.onOpenResultRequested((request) =>
          latest.current.onOpenResult(
            request.experimentFolder,
            request.artefactId,
            request.version,
          ),
        ),
      ),
      subscribe(
        api.onFilesChanged((change) => {
          if (!latest.current.open) return;
          if (touchesCanvases(change)) latest.current.onCanvasFilesChanged();
          if (touchesBibliography(change))
            latest.current.onBibliographyChanged();
        }),
      ),
    ];
    return () => {
      stops.forEach((stop) => stop());
      // The canvas window belongs to the project that is closing.
      void api.close();
    };
  }, [api, folder]);

  const popOut = useCallback(async () => {
    setFailed(false);
    if (!(await beforeOpen())) return;
    const result = await api
      .open(folder, writable)
      .catch(() => ({ ok: false as const }));
    if (!result.ok) setFailed(true);
  }, [api, folder, writable, beforeOpen]);

  return { open, failed, popOut };
}
