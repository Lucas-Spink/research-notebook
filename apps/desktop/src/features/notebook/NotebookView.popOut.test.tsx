import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { stubFlowEnvironment } from "../../shared/flowTesting";
import type { OpenResultRequested } from "../../ipc/bindings";
import type { PopOutApi } from "./canvasWindow/api";
import { sampleNotebook } from "./model/fakeApi";
import { testModel } from "./model/testModel";
import { NotebookView } from "./NotebookView";
import { prepareInteractiveTable } from "./table/tableTesting";

/**
 * ADR-0066: the canvas can be popped out into its own window. While it is,
 * the table window does not offer the canvas, since the other window is its
 * only editor, and it opens results the other window asks for.
 */

const { state } = sampleNotebook();
prepareInteractiveTable();
beforeAll(stubFlowEnvironment);

let root: Root | null = null;
let place: HTMLElement | null = null;
afterEach(() => {
  if (root) act(() => root?.unmount());
  place?.remove();
  root = null;
  place = null;
});

const flush = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

/** A pop-out api that records what the table window asks and lets a test play the canvas window. */
function fakePopOut() {
  const changed = new Set<(open: boolean) => void>();
  const requested = new Set<(request: OpenResultRequested) => void>();
  const calls: string[] = [];
  const api: PopOutApi = {
    open: () => {
      calls.push("open");
      return Promise.resolve({ ok: true });
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
    onFilesChanged: () => Promise.resolve(() => undefined),
  };
  return {
    api,
    calls,
    windowChanged: (open: boolean) =>
      act(() => changed.forEach((handler) => handler(open))),
    openRequested: (request: OpenResultRequested) =>
      act(() => requested.forEach((handler) => handler(request))),
  };
}

async function mountWith(fake: ReturnType<typeof fakePopOut>) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  place = document.createElement("div");
  document.body.append(place);
  root = createRoot(place);
  act(() =>
    root?.render(
      <NotebookView
        notebook={testModel(state)}
        folder={1}
        popOutApi={fake.api}
      />,
    ),
  );
  await flush();
  return place;
}

const buttonIn = (view: HTMLElement, label: string): HTMLButtonElement => {
  const found = [...view.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no ${label}`);
  return found;
};

const press = (button: HTMLButtonElement) =>
  act(async () => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });

describe("popping the canvas out of the table window", () => {
  it("offers Pop out canvas beside the Table and Canvas switch", async () => {
    const view = await mountWith(fakePopOut());
    expect(buttonIn(view, "Pop out canvas")).toBeDefined();
    expect(buttonIn(view, "Canvas").disabled).toBe(false);
  });

  it("opens the canvas window, after leaving the canvas view for the table", async () => {
    const fake = fakePopOut();
    const view = await mountWith(fake);
    await press(buttonIn(view, "Canvas"));
    expect(view.querySelector(".canvas-view")).not.toBeNull();
    await press(buttonIn(view, "Pop out canvas"));
    await flush();
    expect(fake.calls).toContain("open");
    expect(view.querySelector(".canvas-view")).toBeNull();
    expect(view.querySelector(".wtable")).not.toBeNull();
  });

  it("does not offer the in-window canvas while the canvas window is open", async () => {
    const fake = fakePopOut();
    const view = await mountWith(fake);
    fake.windowChanged(true);
    expect(buttonIn(view, "Canvas").disabled).toBe(true);
    expect(buttonIn(view, "Show canvas window")).toBeDefined();
  });

  it("offers the in-window canvas again when the canvas window closes", async () => {
    const fake = fakePopOut();
    const view = await mountWith(fake);
    fake.windowChanged(true);
    fake.windowChanged(false);
    expect(buttonIn(view, "Canvas").disabled).toBe(false);
    expect(buttonIn(view, "Pop out canvas")).toBeDefined();
  });

  it("closes the canvas window when the project closes", async () => {
    const fake = fakePopOut();
    await mountWith(fake);
    act(() => root?.unmount());
    root = null;
    expect(fake.calls).toContain("close");
  });

  it("opens the result the canvas window asked for, in the side pane", async () => {
    const fake = fakePopOut();
    const view = await mountWith(fake);
    fake.openRequested({
      experimentFolder: "EXP-001",
      artefactId: "01JB0000000000000000000001",
      version: 1,
    });
    await flush();
    // The result is not in the sample notebook, so the pane says so rather than failing.
    expect(view.textContent).toContain("no longer in the experiment");
  });
});
