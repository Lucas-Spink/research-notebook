import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  serialiseCanvas,
  type NotebookState,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import type { CanvasApi } from "../canvas";
import { stubFlowEnvironment } from "../../shared/flowTesting";
import { sha256Hex } from "../../shared/sha256";
import { sampleNotebook } from "./model/fakeApi";
import { testModel } from "./model/testModel";
import { NotebookView } from "./NotebookView";
import { prepareInteractiveTable } from "./table/tableTesting";

/**
 * ADR-0065: in the table view a pane shows a question's notes, and the figures
 * their lines refer to, read-only, with a way to open that question's canvas.
 * Nothing is read from the canvases until the pane is opened.
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
      ],
    },
  ],
});
const withFigure: NotebookState = {
  ...state,
  artefacts: { ...state.artefacts, "EXP-001": { kind: "file", file: figure } },
};

const pathOf = (id: string) => `_notebook/canvases/${id}.canvas.json`;

function seeded(text = "The dotplot is flat"): string {
  return serialiseCanvas({
    format_version: 2,
    id: first,
    name: "Q-001 First",
    nodes: [
      {
        id: "01JAXN00000000000000000001",
        type: "note",
        text,
        position: { x: 0, y: 0 },
        size: { width: 260, height: 160 },
      },
      {
        id: "01JAXN00000000000000000002",
        type: "artefact",
        experiment_id: one,
        artefact_id: PLOT,
        version: 1,
        position: { x: 400, y: 0 },
        size: { width: 360, height: 280 },
      },
    ],
    edges: [
      {
        id: "01JAXD00000000000000000001",
        source: "01JAXN00000000000000000001",
        target: "01JAXN00000000000000000002",
      },
    ],
    viewport: { x: 0, y: 0, zoom: 1 },
  });
}

function fakeCanvasApi(initial: Record<string, string>) {
  const disk: Record<string, string> = { ...initial };
  const calls: string[] = [];
  const api = {
    listNotebookFiles: () => {
      calls.push("list");
      return Promise.resolve({
        status: "ok",
        data: {
          questionFiles: [],
          experimentFolders: [],
          canvasFiles: Object.keys(disk).map((path) =>
            path.slice("_notebook/canvases/".length),
          ),
        },
      });
    },
    readNotebookFile: (_f: unknown, path: string) =>
      Promise.resolve({
        status: "ok",
        data:
          disk[path] === undefined
            ? { kind: "missing" }
            : { kind: "text", text: disk[path], sha256: sha256Hex(disk[path]) },
      }),
    writeNotebookFile: (_f: unknown, path: string, text: string) => {
      calls.push("write");
      disk[path] = text;
      return Promise.resolve({
        status: "ok",
        data: { kind: "saved", snapshot: null },
      });
    },
  };
  return { api: api as unknown as CanvasApi, disk, calls };
}

let root: Root | null = null;
let place: HTMLElement | null = null;
afterEach(() => {
  if (root) act(() => root?.unmount());
  place?.remove();
  root = null;
  place = null;
});

const flush = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));
const click = (el: Element | null | undefined) => {
  if (!el) throw new Error("nothing to click");
  return act(async () => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
};

async function mount(
  initial: Record<string, string> = {},
  options: { select?: string; open?: boolean } = {},
) {
  const canvas = fakeCanvasApi(initial);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  place = document.createElement("div");
  document.body.append(place);
  root = createRoot(place);
  act(() =>
    root?.render(
      <NotebookView
        notebook={testModel(withFigure)}
        folder={1}
        canvasApi={canvas.api}
      />,
    ),
  );
  if (options.select !== undefined) {
    await click(
      place.querySelector(`button[aria-label="Select ${options.select}"]`),
    );
  }
  if (options.open !== false) {
    const button = [...place.querySelectorAll('[role="toolbar"] button')].find(
      (b) => b.textContent === "Canvas notes",
    );
    await click(button);
    await flush();
  }
  return { view: place, ...canvas };
}

const pane = (view: HTMLElement) => view.querySelector("aside.pane");
const shownQuestion = (view: HTMLElement) =>
  view.querySelector<HTMLSelectElement>("aside.pane select")?.selectedOptions[0]
    ?.textContent;

describe("the Canvas notes pane in the table view", () => {
  it("is opened from the ribbon's Home tab", async () => {
    const { view } = await mount({ [pathOf(first)]: seeded() });
    expect(pane(view)).not.toBeNull();
    expect(pane(view)?.textContent).toContain("Canvas notes");
  });

  it("shows a question's notes and the figures their lines refer to", async () => {
    const { view } = await mount({ [pathOf(first)]: seeded() });
    const text = pane(view)?.textContent ?? "";
    expect(text).toContain("The dotplot is flat");
    expect(text).toContain("Refers to");
    expect(text).toContain("PCA plot (EXP-001, v1)");
  });

  it("opens on the question the table has selected", async () => {
    const { view } = await mount(
      { [pathOf(first)]: seeded() },
      { select: "Q-002" },
    );
    expect(shownQuestion(view)).toBe("Q-002 Second");
    expect(pane(view)?.textContent).toContain("No notes on this canvas yet");
  });

  it("changes question from its own list without changing the table's selection", async () => {
    const { view } = await mount(
      { [pathOf(first)]: seeded() },
      { select: "Q-002" },
    );
    const select = view.querySelector<HTMLSelectElement>("aside.pane select");
    if (select === null) throw new Error("no question list");
    await act(async () => {
      select.value = "Q-001.md";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      await Promise.resolve();
    });
    await flush();
    expect(shownQuestion(view)).toBe("Q-001 First");
    expect(pane(view)?.textContent).toContain("The dotplot is flat");
  });

  it("only shows the notes: nothing in it can be edited", async () => {
    const { view, calls } = await mount({ [pathOf(first)]: seeded() });
    expect(
      pane(view)?.querySelector("textarea, input[type='text']"),
    ).toBeNull();
    expect(calls).not.toContain("write");
  });

  // Canvases are read with the project so notes' citations reach the
  // Bibliography (ADR-0065); reading never writes.
  it("reads the canvases for the Bibliography without writing anything", async () => {
    const { calls } = await mount(
      { [pathOf(first)]: seeded() },
      { open: false },
    );
    expect(calls).toContain("list");
    expect(calls).not.toContain("write");
  });

  it("opens the question's canvas on a button", async () => {
    const { view } = await mount(
      { [pathOf(first)]: seeded() },
      { select: "Q-002" },
    );
    const open = [...(pane(view)?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Open on canvas",
    );
    await click(open);
    await flush();
    expect(view.querySelector(".canvas-view")).not.toBeNull();
    expect(
      view.querySelector('.canvas-tabs [role="tab"][aria-selected="true"]')
        ?.textContent,
    ).toBe("Q-002 Second");
  });

  it("follows the canvas's question while the canvas is showing", async () => {
    const { view } = await mount({ [pathOf(first)]: seeded() });
    const canvasButton = [
      ...view.querySelectorAll('.workspace__views [role="group"] button'),
    ].find((b) => b.textContent === "Canvas");
    await click(canvasButton);
    await flush();
    const tab = [
      ...view.querySelectorAll<HTMLElement>('.canvas-tabs [role="tab"]'),
    ].find((t) => t.textContent?.includes("Q-002"));
    await click(tab);
    await flush();
    expect(shownQuestion(view)).toBe("Q-002 Second");
  });

  it("lists a source cited in a note in the table's Bibliography, with no pane open", async () => {
    const { view } = await mount(
      { [pathOf(first)]: seeded("As in [@z:u:7XK2PQ9M]") },
      { open: false },
    );
    await flush();
    expect(
      view.querySelector('.bibliography [data-citekey="z:u:7XK2PQ9M"]'),
    ).not.toBeNull();
  });
});
