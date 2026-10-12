import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CanvasWindowError,
  OpenResultRequested,
} from "../../../ipc/bindings";
import type { PopOutApi } from "./api";
import type { FilesChanged } from "./model/changes";
import { useCanvasPopOut, type PopOut } from "./useCanvasPopOut";

let root: Root | null = null;
afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

const flush = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** A pop-out api for tests: it records what the main window asks and lets a test play the other window. */
function fakeApi(
  result: { ok: true } | { ok: false; error: CanvasWindowError } = {
    ok: true,
  },
) {
  const changed = new Set<(open: boolean) => void>();
  const requested = new Set<(request: OpenResultRequested) => void>();
  const files = new Set<(change: FilesChanged) => void>();
  const calls: string[] = [];
  const api: PopOutApi = {
    open: (folder, writable) => {
      calls.push(`open ${folder} ${String(writable)}`);
      return Promise.resolve(result);
    },
    close: () => {
      calls.push("close");
      return Promise.resolve();
    },
    onChanged: (handler) => {
      changed.add(handler);
      return Promise.resolve(() => changed.delete(handler));
    },
    onOpenResultRequested: (handler) => {
      requested.add(handler);
      return Promise.resolve(() => requested.delete(handler));
    },
    onFilesChanged: (handler) => {
      files.add(handler);
      return Promise.resolve(() => files.delete(handler));
    },
  };
  return {
    api,
    calls,
    windowChanged: (open: boolean) =>
      act(() => changed.forEach((handler) => handler(open))),
    openRequested: (request: OpenResultRequested) =>
      act(() => requested.forEach((handler) => handler(request))),
    filesChanged: (change: FilesChanged) =>
      act(() => files.forEach((handler) => handler(change))),
  };
}

type Callbacks = {
  beforeOpen: () => Promise<boolean>;
};

function mount(api: PopOutApi, beforeOpen?: Callbacks["beforeOpen"]) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const callbacks = {
    beforeOpen: beforeOpen ?? vi.fn(() => Promise.resolve(true)),
    onClosed: vi.fn(),
    onCanvasFilesChanged: vi.fn(),
    onBibliographyChanged: vi.fn(),
    onOpenResult: vi.fn(),
  };
  let latest: PopOut | null = null;
  function Probe() {
    latest = useCanvasPopOut({ api, folder: 7, writable: true, ...callbacks });
    return null;
  }
  root = createRoot(document.createElement("div"));
  act(() => root?.render(<Probe />));
  return {
    callbacks,
    popOut: () => {
      if (latest === null) throw new Error("not rendered");
      return latest;
    },
  };
}

const CANVAS_FILE = {
  paths: ["_notebook/canvases/01JAXQ0000000000000000000A.canvas.json"],
  needsRescan: false,
};

describe("useCanvasPopOut", () => {
  it("starts with the canvas in the main window", () => {
    const { popOut } = mount(fakeApi().api);
    expect(popOut().open).toBe(false);
    expect(popOut().failed).toBe(false);
  });

  it("makes ready before opening: the canvas is saved and the table shown first", async () => {
    const fake = fakeApi();
    const order: string[] = [];
    const { popOut } = mount(fake.api, () => {
      order.push(`ready after ${fake.calls.length} calls`);
      return Promise.resolve(true);
    });
    await flush();
    await act(() => popOut().popOut());
    expect(order).toEqual(["ready after 0 calls"]);
    expect(fake.calls).toEqual(["open 7 true"]);
  });

  it("does not open the window when getting ready fails, so no edit is left behind", async () => {
    const fake = fakeApi();
    const { popOut } = mount(fake.api, () => Promise.resolve(false));
    await flush();
    await act(() => popOut().popOut());
    expect(fake.calls).toEqual([]);
  });

  it("follows the window opening and going away, however it closed", async () => {
    const fake = fakeApi();
    const { popOut, callbacks } = mount(fake.api);
    await flush();
    fake.windowChanged(true);
    expect(popOut().open).toBe(true);
    expect(callbacks.onClosed).not.toHaveBeenCalled();
    fake.windowChanged(false);
    expect(popOut().open).toBe(false);
    expect(callbacks.onClosed).toHaveBeenCalledOnce();
  });

  it("reports that the window could not be opened", async () => {
    const fake = fakeApi({ ok: false, error: { kind: "windowFailed" } });
    const { popOut } = mount(fake.api);
    await flush();
    await act(() => popOut().popOut());
    expect(popOut().failed).toBe(true);
    expect(popOut().open).toBe(false);
  });

  it("opens a result the canvas window asked for", async () => {
    const fake = fakeApi();
    const { callbacks } = mount(fake.api);
    await flush();
    fake.openRequested({
      experimentFolder: "EXP-001",
      artefactId: "A1",
      version: 2,
    });
    expect(callbacks.onOpenResult).toHaveBeenCalledWith("EXP-001", "A1", 2);
  });

  it("hears of canvas file changes only while the canvas window is open", async () => {
    const fake = fakeApi();
    const { callbacks } = mount(fake.api);
    await flush();
    fake.filesChanged(CANVAS_FILE);
    expect(callbacks.onCanvasFilesChanged).not.toHaveBeenCalled();
    fake.windowChanged(true);
    fake.filesChanged(CANVAS_FILE);
    expect(callbacks.onCanvasFilesChanged).toHaveBeenCalledOnce();
    fake.filesChanged({
      paths: ["_notebook/questions/Q-001.md"],
      needsRescan: false,
    });
    expect(callbacks.onCanvasFilesChanged).toHaveBeenCalledOnce();
  });

  it("hears that the cached sources changed only while the canvas window is open", async () => {
    const fake = fakeApi();
    const { callbacks } = mount(fake.api);
    await flush();
    const change = {
      paths: ["_notebook/bibliography.json"],
      needsRescan: false,
    };
    fake.filesChanged(change);
    expect(callbacks.onBibliographyChanged).not.toHaveBeenCalled();
    fake.windowChanged(true);
    fake.filesChanged(change);
    expect(callbacks.onBibliographyChanged).toHaveBeenCalledOnce();
    expect(callbacks.onCanvasFilesChanged).not.toHaveBeenCalled();
  });

  it("closes the canvas window when the project closes", async () => {
    const fake = fakeApi();
    mount(fake.api);
    await flush();
    act(() => root?.unmount());
    root = null;
    expect(fake.calls).toContain("close");
  });
});
