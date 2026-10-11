import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  parseCanvas,
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
 * ADR-0065, end to end through the notebook: each question has its own canvas,
 * made as a file by its first change and named by the question's id; the notes
 * on it, and the figures their lines join them to, are summarised beside it.
 */

const { state, one, first, second } = sampleNotebook();
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

const pathOf = (questionId: string) =>
  `_notebook/canvases/${questionId}.canvas.json`;

/** A canvas for the first question with a note, a figure card and a line between them. */
function seeded(): string {
  return serialiseCanvas({
    format_version: 2,
    id: first,
    name: "Q-001 First",
    nodes: [
      {
        id: "01JAXN00000000000000000001",
        type: "note",
        text: "The dotplot is flat",
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
      disk[path] = text;
      return Promise.resolve({
        status: "ok",
        data: { kind: "saved", snapshot: null },
      });
    },
  };
  return { api: api as unknown as CanvasApi, disk };
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

async function mountOn(
  initial: Record<string, string> = {},
  selectRef?: string,
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
  if (selectRef !== undefined) {
    await click(
      place.querySelector(`button[aria-label="Select ${selectRef}"]`),
    );
  }
  const view = [
    ...place.querySelectorAll('.workspace__views [role="group"] button'),
  ].find((b) => b.textContent === "Canvas");
  await click(view);
  await flush();
  return { view: place, ...canvas };
}

const tab = (view: HTMLElement, name: string) => {
  const found = [
    ...view.querySelectorAll<HTMLElement>('.canvas-tabs [role="tab"]'),
  ].find((t) => t.textContent?.includes(name));
  if (found === undefined) throw new Error(`no tab ${name}`);
  return found;
};
const selectedTab = (view: HTMLElement) =>
  view
    .querySelector('.canvas-tabs [role="tab"][aria-selected="true"]')
    ?.textContent?.trim();
const notesPanel = (view: HTMLElement) =>
  [...view.querySelectorAll("aside")].find(
    (a) => a.querySelector("h3")?.textContent === "Notes",
  );

describe("a canvas for each question", () => {
  it("has a tab for each question, opens on the first, and lists no notes yet", async () => {
    const { view, disk } = await mountOn();
    expect(
      [...view.querySelectorAll('.canvas-tabs [role="tab"]')].map(
        (t) => t.textContent,
      ),
    ).toEqual(["Q-001 First", "Q-002 Second"]);
    expect(selectedTab(view)).toBe("Q-001 First");
    expect(notesPanel(view)?.textContent).toContain(
      "No notes on this canvas yet",
    );
    expect(Object.keys(disk)).toEqual([]);
  });

  it("opens on the question of the experiment the table had selected", async () => {
    const { view } = await mountOn({}, "EXP-001");
    expect(selectedTab(view)).toBe("Q-001 First");
  });

  it("opens on the question the table had selected", async () => {
    const { view } = await mountOn({}, "Q-002");
    expect(selectedTab(view)).toBe("Q-002 Second");
  });

  it("makes the question's canvas file, named by the question's id, with the first note", async () => {
    const { view, disk } = await mountOn();
    const add = [...view.querySelectorAll("button")].find(
      (b) => b.textContent === "Add note",
    );
    await click(add);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    expect(Object.keys(disk)).toEqual([pathOf(first)]);
    const file = parseCanvas(disk[pathOf(first)] ?? "");
    expect(file.ok && file.value.id).toBe(first);
    expect(file.ok && file.value.nodes[0]?.type).toBe("note");
    expect(notesPanel(view)?.textContent).toContain("Empty note");
  });

  it("keeps each question's notes on its own canvas", async () => {
    const { view, disk } = await mountOn({ [pathOf(first)]: seeded() });
    expect(notesPanel(view)?.textContent).toContain("The dotplot is flat");
    await click(tab(view, "Q-002"));
    await flush();
    expect(selectedTab(view)).toBe("Q-002 Second");
    expect(notesPanel(view)?.textContent).not.toContain("The dotplot is flat");
    expect(Object.keys(disk)).toEqual([pathOf(first)]);
    expect(second).not.toBe(first);
  });

  it("lists, under a note, the figure its line joins it to, found again in the notebook", async () => {
    const { view } = await mountOn({ [pathOf(first)]: seeded() });
    const text = notesPanel(view)?.textContent ?? "";
    expect(text).toContain("The dotplot is flat");
    expect(text).toContain("Refers to");
    expect(text).toContain("PCA plot (EXP-001, v1)");
  });

  it("goes back to the table on the question that was showing", async () => {
    const { view } = await mountOn();
    await click(tab(view, "Q-002"));
    await flush();
    const table = [
      ...view.querySelectorAll('.workspace__views [role="group"] button'),
    ].find((b) => b.textContent === "Table");
    await click(table);
    await flush();
    const row = view
      .querySelector('button[aria-label="Select Q-002"]')
      ?.closest(".wtable__question, [role='row']");
    expect(row?.className).toContain("wtable__row--selected");
  });
});
