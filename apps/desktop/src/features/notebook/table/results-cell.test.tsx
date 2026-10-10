import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  type ArtefactsFileModel,
  type NotebookState,
} from "@research-notebook/format";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { browseResultsLabel } from "../messages";
import { sampleNotebook, testEnv } from "../model/fakeApi";
import { stubActions } from "../model/testModel";
import type { NotebookModel } from "../useNotebook";
import { mountNotebook, prepareInteractiveTable, rowOf } from "./tableTesting";

/**
 * FR-TBL-06 and issue #101: the Results cell holds the experiment's nested,
 * collapsible file tree, where folders are made and files organised, without
 * opening anything else.
 */

const { state } = sampleNotebook();

prepareInteractiveTable();

const RESULT = "01JB0000000000000000000001";

const figure = ArtefactsFile.parse({
  ...EMPTY_ARTEFACTS,
  artefacts: [
    {
      id: RESULT,
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

const withResults = (file: ArtefactsFileModel): NotebookState => ({
  ...state,
  artefacts: { ...state.artefacts, "EXP-001": { kind: "file", file } },
});

type Edit = { folder: string; file: ArtefactsFileModel };

function mount(
  from: NotebookState = state,
  overrides: Partial<NotebookModel> = {},
) {
  const edits: Edit[] = [];
  const mounted = mountNotebook(from, {
    actions: {
      ...stubActions,
      editArtefacts: (folder, change) => {
        const loaded = from.artefacts?.[folder];
        const before = loaded?.kind === "file" ? loaded.file : EMPTY_ARTEFACTS;
        const changed = change(before, testEnv());
        if (!changed.ok)
          return Promise.resolve({ ok: false, error: changed.error });
        edits.push({ folder, file: changed.value });
        return Promise.resolve({ ok: true });
      },
    },
    ...overrides,
  });
  return { ...mounted, edits };
}

function resultsControl(view: HTMLElement, ref: string): HTMLElement {
  const found = rowOf(view, ref).querySelector(
    `[aria-label="${browseResultsLabel(ref)}"]`,
  );
  if (!(found instanceof HTMLElement))
    throw new Error(`no Results control for ${ref}`);
  return found;
}

/** The tree inside an experiment's Results cell. */
const treeIn = (view: HTMLElement, ref: string) =>
  rowOf(view, ref).querySelector('[role="tree"]');
const cellOf = (view: HTMLElement, ref: string) =>
  rowOf(view, ref).querySelector(".wtable__results-wrap");

const withScript = (): NotebookState =>
  withResults(
    ArtefactsFile.parse({
      ...figure,
      artefacts: [
        ...figure.artefacts,
        {
          id: "01JB0000000000000000000009",
          name: "analysis.py",
          role: "method",
          mode: "link",
          type: "script",
          source: { root: "project", path: "code/analysis.py" },
          created: "2026-09-26T10:00:00Z",
          link: {
            sha256: "b".repeat(64),
            size: 10,
            observed_mtime: "2026-09-26T10:00:00Z",
            checked: "2026-09-26T10:00:00Z",
          },
        },
      ],
    }),
  );

/** `figure` with its one result in a folder, to open and close. */
const grouped = (): NotebookState =>
  withResults(
    ArtefactsFile.parse({
      ...figure,
      groups: [
        {
          id: "01JC000000000000000000000A",
          name: "Main figures",
          items: [RESULT],
          groups: [],
        },
      ],
    }),
  );

const click = (element: Element) =>
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

const rowNames = (view: HTMLElement, ref: string) =>
  [...(treeIn(view, ref)?.querySelectorAll('[role="treeitem"]') ?? [])].map(
    (row) => row.querySelector(".results__name-text")?.textContent,
  );

describe("Results cell (FR-TBL-06, issue #101)", () => {
  it("holds each experiment's own tree inside its cell, with totals, and opens no pane", () => {
    const { view } = mount(withResults(figure));
    expect(treeIn(view, "EXP-001")).not.toBeNull();
    expect(cellOf(view, "EXP-001")?.textContent).toContain("1 result");
    expect(view.querySelector("aside.pane")).toBeNull();
    expect(treeIn(view, "EXP-002")).not.toBeNull();
    expect(cellOf(view, "EXP-002")?.textContent).toContain("0 results");
  });

  it("lists each result as a file: its name, then a small icon for its type", () => {
    const { view } = mount(withResults(figure));
    const file = [
      ...(treeIn(view, "EXP-001")?.querySelectorAll('[role="treeitem"]') ?? []),
    ].find((row) => row.textContent === "PCA plot");
    expect(file).toBeDefined();
    const kids = [...(file?.children ?? [])];
    const name = kids.findIndex((k) => k.className === "results__name-text");
    expect(kids[name + 1]?.querySelector("svg.artefact-icon")).not.toBeNull();
    expect(
      file?.querySelector('button[aria-label="Actions for PCA plot"]'),
    ).not.toBeNull();
  });

  it("opens and closes a folder in place, and the folder's files follow it", () => {
    const { view } = mount(grouped());
    expect(rowNames(view, "EXP-001")).toEqual([
      "Main figures",
      "PCA plot",
      "Ungrouped",
    ]);
    const folder = treeIn(view, "EXP-001")?.querySelector(
      '[aria-expanded="true"]',
    );
    if (!folder) throw new Error("no open folder");
    click(folder);
    expect(rowNames(view, "EXP-001")).toEqual(["Main figures", "Ungrouped"]);
    click(folder);
    expect(rowNames(view, "EXP-001")).toEqual([
      "Main figures",
      "PCA plot",
      "Ungrouped",
    ]);
  });

  it("moves from the heading into the tree with Enter, and back with Escape", () => {
    const { view } = mount(withResults(figure));
    const heading = resultsControl(view, "EXP-001");
    act(() => {
      heading.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    const first = treeIn(view, "EXP-001")?.querySelector('[role="treeitem"]');
    expect(document.activeElement).toBe(first);
    act(() => {
      first?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(document.activeElement).toBe(heading);
  });

  it("makes a folder from the cell and saves it in artefacts.yaml", async () => {
    const { view, edits } = mount(withResults(figure));
    const open = [
      ...(cellOf(view, "EXP-001")?.querySelectorAll("button") ?? []),
    ].find((b) => b.textContent === "New group");
    if (!open) throw new Error("no New group button");
    click(open);
    const form = cellOf(view, "EXP-001")?.querySelector("form");
    const input = form?.querySelector("input");
    if (!(input instanceof HTMLInputElement) || !form) {
      throw new Error("no New group form");
    }
    act(() => {
      Reflect.set(HTMLInputElement.prototype, "value", "Main figures", input);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      form.dispatchEvent(
        new Event("submit", { bubbles: true, cancelable: true }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(edits).toHaveLength(1);
    expect(edits[0]?.folder).toBe("EXP-001");
    expect(edits[0]?.file.groups.map((g) => g.name)).toEqual(["Main figures"]);
  });

  it("has the plus for adding results inside the cell", () => {
    const { view } = mount(withResults(figure));
    expect(
      cellOf(view, "EXP-001")?.querySelector(".wtable__add-result"),
    ).not.toBeNull();
  });

  it("can be browsed, but not changed, in a read-only project", () => {
    const { view } = mount(withResults(figure), { writable: false });
    const cell = cellOf(view, "EXP-001");
    expect(treeIn(view, "EXP-001")).not.toBeNull();
    expect(cell?.querySelector("form")).toBeNull();
    expect(cell?.querySelector(".results__actions")).toBeNull();
    expect(cell?.querySelector(".wtable__add-result")).toBeNull();
  });

  it("has a Code folder for linked scripts, listing the scripts an experiment links", () => {
    const { view } = mount(withScript());
    const code = cellOf(view, "EXP-001")?.querySelector(".code-folder");
    expect(code?.textContent).toContain("Code");
    expect(code?.textContent).toContain("1 script");
    expect(code?.textContent).toContain("analysis.py");
    expect(code?.textContent).toContain("code/analysis.py");
    expect(code?.querySelector("svg.artefact-icon")).not.toBeNull();
    // A script is not a result: it is not among the groups' files.
    expect(treeIn(view, "EXP-001")?.textContent).not.toContain("analysis.py");
  });

  it("offers to link a script, and says there are none yet when there are none", () => {
    const { view } = mount(withResults(figure));
    const code = cellOf(view, "EXP-001")?.querySelector(".code-folder");
    expect(code?.textContent).toContain("No scripts yet");
    expect(
      [...(code?.querySelectorAll("button") ?? [])].some(
        (b) => b.textContent === "Link script…",
      ),
    ).toBe(true);
  });
});
