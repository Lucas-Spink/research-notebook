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
import { editLabel, selectLabel } from "./messages";
import { sampleNotebook } from "./model/fakeApi";
import { stubActions, testModel } from "./model/testModel";
import { NotebookView } from "./NotebookView";
import { prepareInteractiveTable, typeInto } from "./table/tableTesting";

/**
 * ADR-0064, phase 3: beside the canvas, a row of question tabs and under it a
 * row of that question's experiments, then the experiment's Methods, Results
 * Notes and Interpretation. They are the table's own editors on the same
 * experiments; one is live at a time in the whole window, and changing a tab
 * saves what was being typed.
 */

const { state, one } = sampleNotebook();
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

const CANVAS_ID = "01JAXC0000000000000000CNV1";
const CANVAS_PATH = `_notebook/canvases/${CANVAS_ID}.canvas.json`;

function canvasText(): string {
  return serialiseCanvas({
    format_version: 2,
    id: CANVAS_ID,
    name: "Compare",
    nodes: [
      {
        id: "01JAXN00000000000000000001",
        type: "artefact",
        experiment_id: one,
        artefact_id: PLOT,
        version: 1,
        position: { x: 0, y: 0 },
        size: { width: 360, height: 280 },
      },
    ],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  });
}

function fakeCanvasApi() {
  const disk: Record<string, string> = { [CANVAS_PATH]: canvasText() };
  const api = {
    listNotebookFiles: () =>
      Promise.resolve({
        status: "ok",
        data: {
          questionFiles: [],
          experimentFolders: [],
          canvasFiles: [`${CANVAS_ID}.canvas.json`],
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
      disk[path] = text;
      return Promise.resolve({
        status: "ok",
        data: { kind: "saved", snapshot: null },
      });
    },
    moveToTrash: () =>
      Promise.resolve({ status: "ok", data: { location: "x" } }),
  };
  return api as unknown as CanvasApi;
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

type Saved = [string, string, string];

function mount() {
  const saved: Saved[] = [];
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  place = document.createElement("div");
  document.body.append(place);
  root = createRoot(place);
  const notebook = testModel(withFigure, {
    actions: {
      ...stubActions,
      editExperimentSection: (id, key, text) => {
        saved.push([id, key, text]);
        return Promise.resolve({ ok: true });
      },
    },
  });
  act(() =>
    root?.render(
      <NotebookView
        notebook={notebook}
        folder={1}
        canvasApi={fakeCanvasApi()}
      />,
    ),
  );
  return { view: place, saved };
}

async function toCanvas(view: HTMLElement) {
  const button = [
    ...view.querySelectorAll('.workspace__views [role="group"] button'),
  ].find((b) => b.textContent === "Canvas");
  await click(button);
  await flush();
}

const tab = (view: HTMLElement, name: string): HTMLElement => {
  const found = [...view.querySelectorAll<HTMLElement>('[role="tab"]')].find(
    (t) => t.textContent?.includes(name),
  );
  if (found === undefined) throw new Error(`no tab ${name}`);
  return found;
};
const selectedTabs = (view: HTMLElement) =>
  [...view.querySelectorAll('.canvas-writing [role="tab"]')]
    .filter((t) => t.getAttribute("aria-selected") === "true")
    .map((t) => t.textContent);
const panel = (view: HTMLElement) => {
  const found = view.querySelector(".canvas-writing");
  if (!(found instanceof HTMLElement)) throw new Error("no writing panel");
  return found;
};
const editSection = (view: HTMLElement, label: string) =>
  panel(view).querySelector(
    `[role="button"][aria-label="${editLabel(label)}"]`,
  );

describe("the writing panel", () => {
  it("has a tab for each question, and under them the experiments of the one shown", async () => {
    const { view } = mount();
    await toCanvas(view);
    const questions = [
      ...view.querySelectorAll('[aria-label="Questions"] [role="tab"]'),
    ].map((t) => t.textContent);
    expect(questions).toEqual(["Q-001 First", "Q-002 Second"]);
    const experiments = [
      ...view.querySelectorAll('[aria-label="Experiments"] [role="tab"]'),
    ].map((t) => t.textContent);
    expect(experiments).toEqual(["EXP-001 One", "EXP-002 Two"]);
    expect(selectedTabs(view)).toEqual(["Q-001 First", "EXP-001 One"]);
  });

  it("shows Methods, Results notes and Interpretation of the experiment, none live until chosen", async () => {
    const { view } = mount();
    await toCanvas(view);
    const labels = [...panel(view).querySelectorAll("label")].map(
      (l) => l.textContent,
    );
    expect(labels).toEqual(["Methods", "Results notes", "Interpretation"]);
    expect(panel(view).querySelector(".ProseMirror")).toBeNull();
    expect(panel(view).querySelector(".expanded--stacked")).not.toBeNull();
  });

  it("opens on the experiment the table had selected", async () => {
    const { view } = mount();
    const title = view.querySelector(
      `button[aria-label="${selectLabel("EXP-002")}"]`,
    );
    await click(title);
    await toCanvas(view);
    expect(selectedTabs(view)).toEqual(["Q-001 First", "EXP-002 Two"]);
  });

  it("makes the section chosen the one live editor, and saves what is typed through the table's own path", async () => {
    const { view, saved } = mount();
    await toCanvas(view);
    await click(editSection(view, "Methods"));
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(1);
    typeInto(panel(view), " from the canvas");
    await click(tab(view, "EXP-002"));
    expect(
      saved.some(
        ([id, key, text]) =>
          id === one && key === "methods" && text.includes("from the canvas"),
      ),
    ).toBe(true);
  });

  it("saves what was typed before it changes experiment, and shows the other with nothing live", async () => {
    const { view } = mount();
    await toCanvas(view);
    await click(editSection(view, "Interpretation"));
    typeInto(panel(view), " draft");
    await click(tab(view, "EXP-002"));
    expect(selectedTabs(view)).toEqual(["Q-001 First", "EXP-002 Two"]);
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(0);
  });

  it("comes back to the experiment last used when a question is chosen again", async () => {
    const { view } = mount();
    await toCanvas(view);
    await click(tab(view, "EXP-002"));
    await click(tab(view, "Q-002"));
    expect(selectedTabs(view)).toEqual(["Q-002 Second"]);
    expect(panel(view).textContent).toContain("no experiments");
    await click(tab(view, "Q-001"));
    expect(selectedTabs(view)).toEqual(["Q-001 First", "EXP-002 Two"]);
  });

  it("moves between tabs with the arrow keys", async () => {
    const { view } = mount();
    await toCanvas(view);
    const first = tab(view, "EXP-001");
    await act(async () => {
      first.dispatchEvent(
        new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
      );
      await Promise.resolve();
    });
    await flush();
    expect(selectedTabs(view)).toEqual(["Q-001 First", "EXP-002 Two"]);
  });

  it("follows a card that is clicked, and the table lands on that experiment afterwards", async () => {
    const { view } = mount();
    await toCanvas(view);
    await click(tab(view, "EXP-002"));
    expect(selectedTabs(view)).toEqual(["Q-001 First", "EXP-002 Two"]);
    await click(view.querySelector(".react-flow__node"));
    await flush();
    expect(selectedTabs(view)).toEqual(["Q-001 First", "EXP-001 One"]);
    const backToTable = [
      ...view.querySelectorAll('.workspace__views [role="group"] button'),
    ].find((b) => b.textContent === "Table");
    await click(backToTable);
    await flush();
    const row = view
      .querySelector(`button[aria-label="${selectLabel("EXP-001")}"]`)
      ?.closest('[role="row"]');
    expect(row?.classList.contains("wtable__row--selected")).toBe(true);
  });

  it("is one editor in the whole window even with the details pane open", async () => {
    const { view } = mount();
    await toCanvas(view);
    await click(editSection(view, "Methods"));
    const details = [...view.querySelectorAll('[role="toolbar"] button')].find(
      (b) => b.textContent === "Details",
    );
    await click(details);
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(1);
  });
});
