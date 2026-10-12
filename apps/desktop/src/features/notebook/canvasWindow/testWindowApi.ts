import { act } from "react";
import type { CanvasWindowContext } from "../../../ipc/bindings";
import type { CanvasWindowApi } from "./api";
import type { FilesChanged } from "./model/changes";

/**
 * A canvas window api for tests: it hands out `context`, lets a test send file
 * changes and "close the window", and records the requests made of the main
 * window.
 */
export function fakeWindowApi(context: CanvasWindowContext | null) {
  const handlers = new Set<(change: FilesChanged) => void>();
  const closers = new Set<() => Promise<void>>();
  const opened: { experimentFolder: string; artefactId: string }[] = [];
  const api: CanvasWindowApi = {
    context: () => Promise.resolve(context),
    onFilesChanged: (handler) => {
      handlers.add(handler);
      return Promise.resolve(() => handlers.delete(handler));
    },
    requestOpenResult: (request) => {
      opened.push(request);
      return Promise.resolve();
    },
    onCloseRequested: (handler) => {
      closers.add(handler);
      return Promise.resolve(() => closers.delete(handler));
    },
  };
  return {
    api,
    opened,
    listeners: () => handlers.size,
    send: (change: FilesChanged) =>
      act(() => handlers.forEach((handler) => handler(change))),
    /** What the window does when it is asked to close: every handler runs, and it closes when they settle. */
    close: () => Promise.all([...closers].map((closer) => closer())),
  };
}
