import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  parseCanvas,
  type NotebookState,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CanvasApi } from "../canvas";
import { stubFlowEnvironment } from "../../shared/flowTesting";
import { sha256Hex } from "../../shared/sha256";
import { sampleNotebook } from "./model/fakeApi";
import { stubActions, testModel } from "./model/testModel";
import { NotebookView } from "./NotebookView";
import { prepareInteractiveTable } from "./table/tableTesting";

/**
 * ADR-0064, phase 2, end to end through the notebook: the results of every
 * experiment are listed beside the canvas, a result dragged out of its tree (or
 * pinned from its menu) becomes a card that points at it, and nothing about the
 * result, its groups or its experiment changes.
 */

const { state, one, first } = sampleNotebook();
prepareInteractiveTable();
beforeAll(stubFlowEnvironment);

const PLOT = "01JB0000000000000000000001";
const figure = ArtefactsFile.parse({
  ...EMPTY_ARTEFACTS,
  artefacts: [
    {
      id: PLOT,
      name: "PCA plot",
      role: "result",
      mode: "copy",
      type: "image",
      source: { root: "project", path: "results/pca.png" },
      created: "2026-09-26T10:00:00Z",
      versions: [
        {
          v: 1,
          file: "evidence/pca.png",
          sha256: "a".repeat(64),
          size: 10,
          captured: "2026-09-26T10:00:00Z",
        },
        {
          v: 2,
          file: "evidence/pca.v2.png",
          sha256: "b".repeat(64),
          size: 11,
          captured: "2026-09-27T10:00:00Z",
        },
      ],
    },
  ],
});
const withFigure: NotebookState = {
  ...state,
  artefacts: { ...state.artefacts, "EXP-001": { kind: "file", file: figure } },
};

// A question's canvas is named by the question's own id (ADR-0065).
const CANVAS_ID = first;
const CANVAS_PATH = `_notebook/canvases/${CANVAS_ID}.canvas.json`;

function fakeCanvasApi() {
  const disk: Record<string, string> = {};
  const writes: string[] = [];
  const api = {
    listNotebookFiles: () =>
      Promise.resolve({
        status: "ok",
        data: {
          questionFiles: [],
          experimentFolders: [],
          canvasFiles: Object.keys(disk).map((path) =>
            path.slice("_notebook/canvases/".length),
          ),
        },
      }),
    readNotebookFile: (_f: unknown, path: string) =>
      Promise.resolve({
        status: "ok",
        data:
          disk[path] === undefined
            ? { kind: "missing" }
            : { kind: "text", text: disk[path], sha256: sha256Hex(disk[path]) },
      }),
    writeNotebookFile: (_f: unknown, path: string, text: string) => {
      writes.push(path);
      disk[path] = text;
      return Promise.resolve({
        status: "ok",
        data: { kind: "saved", snapshot: null },
      });
    },
    moveToTrash: () =>
      Promise.resolve({ status: "ok", data: { location: "x" } }),
  };
  return { api: api as unknown as CanvasApi, disk, writes };
}

let root: Root | null = null;
let place: HTMLElement | null = null;
afterEach(() => {
  if (root) act(() => root?.unmount());
  place?.remove();
  root = null;
  place = null;
  Reflect.deleteProperty(document, "elementFromPoint");
});

const flush = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

async function openCanvas(selectFirst?: string) {
  const editArtefacts = vi.fn(stubActions.editArtefacts);
  const canvas = fakeCanvasApi();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  place = document.createElement("div");
  document.body.append(place);
  root = createRoot(place);
  const notebook = testModel(withFigure, {
    actions: { ...stubActions, editArtefacts },
  });
  act(() =>
    root?.render(
      <NotebookView notebook={notebook} folder={1} canvasApi={canvas.api} />,
    ),
  );
  if (selectFirst !== undefined) {
    const title = place.querySelector(
      `button[aria-label="Select ${selectFirst}"]`,
    );
    await act(async () => {
      title?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
  }
  const switchTo = [
    ...place.querySelectorAll('.workspace__views [role="group"] button'),
  ].find((b) => b.textContent === "Canvas");
  await act(async () => {
    switchTo?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
  await flush();
  return { view: place, editArtefacts, ...canvas };
}

const button = (within: ParentNode, label: string) => {
  const found = [...within.querySelectorAll("button")].find((b) =>
    b.textContent?.includes(label),
  );
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
};
const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

/** The current question's experiments open by themselves; this opens one that is not. */
async function expandExperiment(view: HTMLElement) {
  if (view.querySelector('[role="tree"]') !== null) return;
  click(button(view, "EXP-001"));
  await flush();
}

const rowNamed = (view: HTMLElement, name: string): HTMLElement => {
  const found = [
    ...view.querySelectorAll<HTMLElement>('[role="treeitem"]'),
  ].find((r) => r.querySelector(".results__name-text")?.textContent === name);
  if (found === undefined) throw new Error(`no row ${name}`);
  return found;
};

const pointer = (target: EventTarget, type: string, x: number, y: number) =>
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
      }),
    );
  });

describe("the results beside the canvas", () => {
  it("lists every experiment of the project by question, with a count of its results", async () => {
    const { view } = await openCanvas();
    const panel = view.querySelector(".canvas-results");
    expect(panel?.textContent).toContain("Q-001 First");
    expect(panel?.textContent).toContain("EXP-001 One");
    expect(panel?.textContent).toContain("1 result");
    expect(panel?.textContent).toContain("EXP-002 Two");
    expect(panel?.textContent).toContain("0 results");
  });

  it("shows an experiment's results as the same tree the table uses, for the question being worked on", async () => {
    const { view } = await openCanvas();
    expect(view.querySelector('[role="tree"]')).not.toBeNull();
    expect(rowNamed(view, "PCA plot")).toBeDefined();
  });

  it("narrows the list by what is typed", async () => {
    const { view } = await openCanvas();
    const search = view.querySelector<HTMLInputElement>('input[type="search"]');
    if (search === null) throw new Error("no search box");
    act(() => {
      Reflect.set(HTMLInputElement.prototype, "value", "pca", search);
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const text = view.querySelector(".canvas-results")?.textContent ?? "";
    expect(text).toContain("EXP-001");
    expect(text).not.toContain("EXP-002");
  });
});

describe("thumbnails and order in the list", () => {
  it("shows a picture beside each result", async () => {
    const { view } = await openCanvas();
    await expandExperiment(view);
    expect(
      rowNamed(view, "PCA plot").querySelector(".results__thumb"),
    ).not.toBeNull();
    expect(
      rowNamed(view, "PCA plot").classList.contains("results__row--with-thumb"),
    ).toBe(true);
  });

  it("opens on the question being worked on, with its experiments already showing", async () => {
    const { view } = await openCanvas("EXP-001");
    expect(rowNamed(view, "PCA plot")).toBeDefined();
    const headings = [...view.querySelectorAll(".canvas-results h4")].map(
      (h) => h.textContent,
    );
    expect(headings[0]).toBe("Q-001 First");
  });

  it("keeps the experiments of other questions closed", async () => {
    const { view } = await openCanvas();
    const second = [...view.querySelectorAll(".canvas-results__question")].find(
      (q) => q.querySelector("h4")?.textContent?.includes("Q-002"),
    );
    expect(second?.querySelector('[role="tree"]') ?? null).toBeNull();
  });
});

describe("pinning from the list", () => {
  it("makes a card of a result dragged onto the canvas, and saves the canvas", async () => {
    const { view, disk, editArtefacts } = await openCanvas();
    await expandExperiment(view);
    const zone = view.querySelector('[data-drop-zone="canvas"]');
    if (zone === null) throw new Error("no canvas");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => zone,
    });
    pointer(rowNamed(view, "PCA plot"), "pointerdown", 10, 10);
    pointer(window, "pointermove", 400, 300);
    pointer(window, "pointerup", 400, 300);
    await flush();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    expect(view.querySelector(".canvas-card")?.textContent).toContain(
      "PCA plot",
    );
    const saved = parseCanvas(disk[CANVAS_PATH] ?? "");
    expect(saved.ok && saved.value.nodes[0]).toMatchObject({
      type: "artefact",
      experiment_id: one,
      artefact_id: PLOT,
      version: 2,
    });
    // The result is still in its tree and nothing about it was changed.
    expect(rowNamed(view, "PCA plot")).toBeDefined();
    expect(editArtefacts).not.toHaveBeenCalled();
    expect(Object.keys(disk)).toEqual([CANVAS_PATH]);
  });

  it("pins from the row's menu for anyone who cannot drag, and marks the result as on the canvas", async () => {
    const { view } = await openCanvas();
    await expandExperiment(view);
    click(
      rowNamed(view, "PCA plot").querySelector(".results__actions") as Element,
    );
    const item = [
      ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ].find((i) => i.textContent?.includes("Pin to canvas"));
    expect(item).toBeDefined();
    click(item as Element);
    await flush();
    expect(view.querySelector(".canvas-card")).not.toBeNull();
    expect(rowNamed(view, "PCA plot").textContent).toContain("On canvas");
  });

  it("opens the original from the card", async () => {
    const { view } = await openCanvas();
    await expandExperiment(view);
    click(
      rowNamed(view, "PCA plot").querySelector(".results__actions") as Element,
    );
    click(
      [
        ...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]'),
      ].find((i) => i.textContent?.includes("Pin to canvas")) as Element,
    );
    await flush();
    click(view.querySelector('button[aria-label="Open PCA plot"]') as Element);
    await flush();
    expect(view.querySelector("aside.pane")).not.toBeNull();
  });
});
