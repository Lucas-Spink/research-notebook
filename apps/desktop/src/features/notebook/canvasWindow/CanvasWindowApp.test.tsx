import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  parseCanvas,
  serialiseBibliography,
  serialiseCanvas,
  type BibliographyFileModel,
  type NotebookState,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { stubFlowEnvironment } from "../../../shared/flowTesting";
import type { CanvasApi } from "../../canvas";
import { commands } from "../../../ipc/bindings";
import { fakeProject, filesOf, sampleNotebook } from "../model/fakeApi";
import { CanvasWindowApp } from "./CanvasWindowApp";
import { fakeWindowApi } from "./testWindowApi";

/**
 * ADR-0066: the pop-out window shows the project's canvas and writes nothing
 * but canvas files.
 */

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
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)));

async function mountWindow(
  context: { folder: number; writable: boolean } | null,
  extra: Record<string, string> = {},
) {
  const project = fakeProject({ ...filesOf(sampleNotebook().state), ...extra });
  const canvasApi: CanvasApi = {
    // The notebook fake lists no canvas files, so they are added to what it lists.
    listNotebookFiles: async (folder) => {
      const listed = await project.read.listNotebookFiles(folder);
      if (listed.status !== "ok") return listed;
      const prefix = "_notebook/canvases/";
      return {
        status: "ok",
        data: {
          ...listed.data,
          canvasFiles: Object.keys(project.disk)
            .filter((path) => path.startsWith(prefix))
            .map((path) => path.slice(prefix.length)),
        },
      };
    },
    readNotebookFile: project.read.readNotebookFile,
    writeNotebookFile: project.write.writeNotebookFile,
  };
  const window = fakeWindowApi(context);
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  place = document.createElement("div");
  document.body.append(place);
  root = createRoot(place);
  act(() =>
    root?.render(
      <CanvasWindowApp
        api={window.api}
        read={project.read}
        canvasApi={canvasApi}
        sourcesApi={{
          readNotebookFile: project.read.readNotebookFile,
          writeNotebookFile: project.write.writeNotebookFile,
          // Never reached: nothing here inserts a citation.
          zoteroFetchSource: commands.zoteroFetchSource,
        }}
      />,
    ),
  );
  await flush();
  return { view: place, project, window };
}

describe("the pop-out canvas window", () => {
  it("says so when it was not opened by the main window, and reads nothing", async () => {
    const { view, project } = await mountWindow(null);
    expect(view.textContent).toContain("Pop out canvas");
    expect(project.calls).toEqual([]);
  });

  it("shows a tab for each question of the project", async () => {
    const { view } = await mountWindow({ folder: 1, writable: true });
    const tabs = [...view.querySelectorAll('.canvas-tabs [role="tab"]')].map(
      (tab) => tab.textContent,
    );
    expect(tabs.length).toBeGreaterThan(0);
    expect(view.querySelector(".canvas-view")).not.toBeNull();
    expect(view.querySelector(".wtable")).toBeNull();
  });

  it("saves a note added just before the window closes, in a canvas file only", async () => {
    const { view, project, window } = await mountWindow({
      folder: 1,
      writable: true,
    });
    const add = [...view.querySelectorAll("button")].find(
      (button) => button.textContent === "Add note",
    );
    if (add === undefined) throw new Error("no Add note");
    await act(async () => {
      add.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await act(() => window.close());
    const written = project.calls.filter((call) => call.startsWith("write "));
    expect(written).toHaveLength(1);
    expect(written[0]).toMatch(/^write _notebook\/canvases\/.+\.canvas\.json$/);
  });

  it("never writes a question or experiment file", async () => {
    const { project } = await mountWindow({ folder: 1, writable: true });
    expect(
      project.calls.filter(
        (call) => call.startsWith("write ") && !call.includes("/canvases/"),
      ),
    ).toEqual([]);
  });

  describe("citations in notes", () => {
    const KEY = "z:u:AAAA2222";
    const source: BibliographyFileModel = [
      {
        id: KEY,
        type: "article-journal",
        title: "Batch effects in organoids",
        author: [{ given: "Ada", family: "Smith" }],
        issued: { "date-parts": [[2024]] },
        _zotero: {
          server_id: null,
          library: "u",
          key: "AAAA2222",
          fetched: "2026-10-01T09:00:00Z",
          status: "ok",
        },
      },
    ];
    const BIBLIOGRAPHY = "_notebook/bibliography.json";

    /** A canvas for the first question with one note that cites the source. */
    function canvasCiting(): Record<string, string> {
      const { first } = sampleNotebook();
      return {
        [`_notebook/canvases/${first}.canvas.json`]: serialiseCanvas({
          format_version: 2,
          id: first,
          name: "Q-001 First",
          nodes: [
            {
              id: "01JAXN00000000000000000001",
              type: "note",
              text: `As in [@${KEY}]`,
              position: { x: 0, y: 0 },
              size: { width: 260, height: 160 },
            },
          ],
          edges: [],
          viewport: { x: 0, y: 0, zoom: 1 },
        }),
      };
    }

    it("shows a cited source by its author and year, as the table window does", async () => {
      const { view } = await mountWindow(
        { folder: 1, writable: true },
        { ...canvasCiting(), [BIBLIOGRAPHY]: serialiseBibliography(source) },
      );
      expect(view.textContent).toContain("Smith 2024");
    });

    it("shows the key when the source is not cached yet, and the label once it is", async () => {
      const { view, project, window } = await mountWindow(
        { folder: 1, writable: true },
        canvasCiting(),
      );
      expect(view.textContent).not.toContain("Smith 2024");
      // The main window cached the source, and relays that the file changed.
      project.disk[BIBLIOGRAPHY] = serialiseBibliography(source);
      window.send({ paths: [BIBLIOGRAPHY], needsRescan: false });
      await flush();
      expect(view.textContent).toContain("Smith 2024");
    });
  });
});

/** A result in EXP-001, for dragging in the pop-out's own Results list. */
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

function notebookWithFigure(): Record<string, string> {
  const { state } = sampleNotebook();
  const withFigure: NotebookState = {
    ...state,
    artefacts: {
      ...state.artefacts,
      "EXP-001": { kind: "file", file: figure },
    },
  };
  return filesOf(withFigure);
}

const click = (el: Element) =>
  act(() => {
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

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

function resultRow(view: HTMLElement): HTMLElement {
  const found = [
    ...view.querySelectorAll<HTMLElement>('[role="treeitem"]'),
  ].find(
    (row) =>
      row.querySelector(".results__name-text")?.textContent === "PCA plot",
  );
  if (found === undefined) throw new Error("no PCA plot row");
  return found;
}

/** The current question's experiments open by themselves; this opens one that is not. */
async function showResults(view: HTMLElement) {
  if (view.querySelector('[role="tree"]') !== null) return;
  const open = [...view.querySelectorAll("button")].find((b) =>
    b.textContent?.includes("EXP-001"),
  );
  if (open === undefined) throw new Error("no EXP-001 button");
  click(open);
  await flush();
}

describe("dragging a result onto the pop-out canvas", () => {
  it("pins it as a card, as in the main window, though the window changes no evidence", async () => {
    const { view, project } = await mountWindow(
      { folder: 1, writable: true },
      notebookWithFigure(),
    );
    await showResults(view);
    const zone = view.querySelector('[data-drop-zone="canvas"]');
    if (zone === null) throw new Error("no canvas");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => zone,
    });
    pointer(resultRow(view), "pointerdown", 10, 10);
    pointer(window, "pointermove", 400, 300);
    pointer(window, "pointerup", 400, 300);
    await flush();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 900));
    });
    expect(view.querySelector(".canvas-card")?.textContent).toContain(
      "PCA plot",
    );
    const canvasWrites = Object.keys(project.disk).filter((path) =>
      path.includes("/canvases/"),
    );
    expect(canvasWrites).toHaveLength(1);
    const saved = parseCanvas(project.disk[canvasWrites[0] ?? ""] ?? "");
    expect(saved.ok && saved.value.nodes[0]).toMatchObject({
      type: "artefact",
      artefact_id: PLOT,
    });
  });

  it("still cannot regroup results by dragging them within the list", async () => {
    const { view, project } = await mountWindow(
      { folder: 1, writable: true },
      notebookWithFigure(),
    );
    await showResults(view);
    const before = { ...project.disk };
    // The pointer ends over the Results list itself, not the canvas.
    const tree = view.querySelector('[role="tree"]');
    if (tree === null) throw new Error("no tree");
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => tree,
    });
    pointer(resultRow(view), "pointerdown", 10, 10);
    pointer(window, "pointermove", 20, 200);
    pointer(window, "pointerup", 20, 200);
    await flush();
    expect(project.disk).toEqual(before);
  });
});
