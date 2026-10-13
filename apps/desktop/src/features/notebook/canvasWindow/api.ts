import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  commands,
  events,
  type CanvasWindowContext,
  type CanvasWindowError,
  type FolderHandle,
  type OpenResultRequested,
} from "../../../ipc/bindings";
import type { FilesChanged } from "./model/changes";

/** Stops listening. */
export type Unlisten = () => void;

/** Turns a listener that is still being registered into one that can be stopped at once. */
export function subscribe(registering: Promise<Unlisten>): Unlisten {
  let stopped = false;
  let stop: Unlisten | null = null;
  registering
    .then((unlisten) => {
      if (stopped) unlisten();
      else stop = unlisten;
    })
    // No window to listen to (tests, a plain browser): nothing is heard.
    .catch(() => undefined);
  return () => {
    stopped = true;
    stop?.();
  };
}

/** What the pop-out canvas window needs from the application. Tests stand in for it. */
export type CanvasWindowApi = {
  /** The project to show, or `null` when this window was not opened by the main one. */
  context: () => Promise<CanvasWindowContext | null>;
  /** The main window relays the watcher's findings here. */
  onFilesChanged: (
    handler: (change: FilesChanged) => void,
  ) => Promise<Unlisten>;
  /** Asks the main window to open one result's original, and brings it to the front. */
  requestOpenResult: (request: OpenResultRequested) => Promise<void>;
  /** The window is about to close: `handler` runs first, and the window closes when it settles. */
  onCloseRequested: (handler: () => Promise<void>) => Promise<Unlisten>;
};

/** What the main window needs to pop the canvas out. */
export type PopOutApi = {
  open: (
    folder: FolderHandle,
    writable: boolean,
  ) => Promise<{ ok: true } | { ok: false; error: CanvasWindowError }>;
  close: () => Promise<void>;
  /** The canvas window opened (`true`) or went away (`false`), however it closed. */
  onChanged: (handler: (open: boolean) => void) => Promise<Unlisten>;
  onOpenResultRequested: (
    handler: (request: OpenResultRequested) => void,
  ) => Promise<Unlisten>;
  onFilesChanged: (
    handler: (change: FilesChanged) => void,
  ) => Promise<Unlisten>;
};

const toChange = (payload: {
  paths: string[];
  needsRescan: boolean;
}): FilesChanged => ({
  paths: payload.paths,
  needsRescan: payload.needsRescan,
});

/** The application's own commands and events. */
export const canvasWindowApi: CanvasWindowApi = {
  context: async () => commands.canvasWindowContext(),
  onFilesChanged: (handler) =>
    events.projectFilesChanged.listen((event) =>
      handler(toChange(event.payload)),
    ),
  requestOpenResult: async (request) => {
    await events.openResultRequested.emit(request);
    await commands.focusMainWindow();
  },
  onCloseRequested: (handler) =>
    getCurrentWindow().onCloseRequested(async () => {
      await handler();
    }),
};

export const popOutApi: PopOutApi = {
  open: async (folder, writable) => {
    const result = await commands.openCanvasWindow(folder, writable);
    return result.status === "ok"
      ? { ok: true }
      : { ok: false, error: result.error };
  },
  // Nothing to close where there is no window to ask (tests, a plain browser).
  close: () => commands.closeCanvasWindow().catch(() => undefined),
  onChanged: (handler) =>
    events.canvasWindowChanged.listen((event) => handler(event.payload.open)),
  onOpenResultRequested: (handler) =>
    events.openResultRequested.listen((event) => handler(event.payload)),
  onFilesChanged: canvasWindowApi.onFilesChanged,
};
