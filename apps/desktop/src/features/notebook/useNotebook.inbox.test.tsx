import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FOLDER, fakeChanges, sampleNotebook } from "./model/fakeApi";

/**
 * Requests that arrive while a project is open are imported on the next
 * poll (ADR-0067). The ipc, the loader and the import itself are replaced, so
 * these tests check only when the hook looks, not what an import does.
 */

const imports = vi.hoisted(() => ({
  onOpen: vi.fn(() => Promise.resolve([])),
  fresh: vi.fn(() => Promise.resolve([])),
}));

vi.mock("../../ipc/bindings", () => ({
  commands: { appVersion: () => Promise.resolve("0.2.0") },
}));
vi.mock("../history", () => ({ createFirstWriteGuard: () => ({}) }));
vi.mock("./model/inboxImport", () => ({
  importInboxOnOpen: imports.onOpen,
  importNewInboxRequests: imports.fresh,
}));
vi.mock("./model/load", () => ({
  loadNotebook: () =>
    Promise.resolve({
      ok: true,
      value: { state: sampleNotebook().state, hashes: {} },
    }),
}));

import { INBOX_POLL_MS, useNotebook } from "./useNotebook";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

/** Mounts a component that runs `useHook(props)`; the repository has no hook-testing library. */
function renderHook<P>(useHook: (props: P) => unknown, initialProps: P) {
  const root = createRoot(document.createElement("div"));
  const Probe = ({ props }: { props: P }): ReactElement | null => {
    useHook(props);
    return null;
  };
  const show = (props: P) =>
    act(() => {
      root.render(createElement(Probe, { props }));
    });
  void show(initialProps);
  return { rerender: show, unmount: () => act(() => root.unmount()) };
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

type Props = { folder: number | null; writable: boolean };

const changes = fakeChanges();
const open = ({ folder, writable }: Props) =>
  useNotebook({ folder, writable, changes });

describe("useNotebook inbox polling", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    imports.onOpen.mockClear();
    imports.fresh.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("looks for new requests on every tick of a writable open project", async () => {
    renderHook<Props>(open, { folder: FOLDER, writable: true });
    await advance(0);
    expect(imports.onOpen).toHaveBeenCalledTimes(1);

    await advance(INBOX_POLL_MS);
    expect(imports.fresh).toHaveBeenCalledTimes(1);
    await advance(INBOX_POLL_MS);
    expect(imports.fresh).toHaveBeenCalledTimes(2);
  });

  it("never looks when the window cannot write", async () => {
    renderHook<Props>(open, { folder: FOLDER, writable: false });
    await advance(INBOX_POLL_MS * 3);
    expect(imports.onOpen).not.toHaveBeenCalled();
    expect(imports.fresh).not.toHaveBeenCalled();
  });

  it("stops looking once the project closes", async () => {
    const { rerender } = renderHook<Props>(open, {
      folder: FOLDER,
      writable: true,
    });
    await advance(INBOX_POLL_MS);
    const calls = imports.fresh.mock.calls.length;

    void rerender({ folder: null, writable: true });
    await advance(INBOX_POLL_MS * 3);
    expect(imports.fresh).toHaveBeenCalledTimes(calls);
  });
});
