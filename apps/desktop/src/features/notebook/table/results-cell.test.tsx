import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  type ArtefactsFileModel,
  type NotebookState,
} from "@research-notebook/format";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { browseResultsLabel, selectLabel } from "../messages";
import { sampleNotebook, testEnv } from "../model/fakeApi";
import { stubActions } from "../model/testModel";
import type { NotebookModel } from "../useNotebook";
import {
  mountNotebook,
  openCell,
  prepareInteractiveTable,
  rowOf,
  tableOf,
  typeInto,
} from "./tableTesting";

/**
 * FR-TBL-06 and ADR-0044 point 4: the Results cell shows counts and
 * thumbnails, and opens in place into the experiment's folder tree, where
 * folders are made and files organised; one thing is open in the table at
 * a time.
 */

const { state } = sampleNotebook();

prepareInteractiveTable();

const figure = ArtefactsFile.parse({
  ...EMPTY_ARTEFACTS,
  artefacts: [
    {
      id: "01JB0000000000000000000001",
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
  const sections: string[] = [];
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
      editExperimentSection: (_id, _key, text) => {
        sections.push(text);
        return Promise.resolve({ ok: true });
      },
    },
    ...overrides,
  });
  return { ...mounted, edits, sections };
}

function resultsControl(view: HTMLElement, ref: string): HTMLElement {
  const found = rowOf(view, ref).querySelector(
    `[aria-label="${browseResultsLabel(ref)}"]`,
  );
  if (!(found instanceof HTMLElement))
    throw new Error(`no Results control for ${ref}`);
  return found;
}

async function openResults(view: HTMLElement, ref: string) {
  await act(async () => {
    resultsControl(view, ref).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const treeIn = (view: HTMLElement, ref: string) =>
  rowOf(view, ref).querySelector('[role="tree"]');

describe("Results cell (FR-TBL-06, ADR-0044)", () => {
  it("says there are none yet, and counts results once there are some", () => {
    const empty = mount();
    expect(resultsControl(empty.view, "EXP-001").textContent).toContain(
      "None yet",
    );
    empty.view.remove();

    const { view } = mount(withResults(figure));
    expect(resultsControl(view, "EXP-001").textContent).toContain("1 result");
  });

  it("opens in place into the folder tree, and selects its row", async () => {
    const { view } = mount(withResults(figure));
    await openResults(view, "EXP-001");
    expect(treeIn(view, "EXP-001")).not.toBeNull();
    expect(
      rowOf(view, "EXP-001")
        .querySelector(`button[aria-label="${selectLabel("EXP-001")}"]`)
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("makes a folder through the tree and saves it in artefacts.yaml", async () => {
    const { view, edits } = mount(withResults(figure));
    await openResults(view, "EXP-001");
    const form = rowOf(view, "EXP-001").querySelector("form");
    const input = form?.querySelector("input");
    if (!(input instanceof HTMLInputElement) || form === null) {
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

  it("keeps one thing open: Results saves and closes a section editor, and a section closes Results", async () => {
    const { view, sections } = mount(withResults(figure));
    await openCell(view, "EXP-001", "methods");
    typeInto(tableOf(view), "Typed before opening Results. ");
    await openResults(view, "EXP-002");
    expect(sections).toHaveLength(1);
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(0);
    expect(treeIn(view, "EXP-002")).not.toBeNull();

    await openCell(view, "EXP-001", "interpretation");
    expect(view.querySelectorAll('[role="tree"]')).toHaveLength(0);
    expect(
      rowOf(view, "EXP-001").querySelectorAll(".ProseMirror"),
    ).toHaveLength(1);
  });

  it("can be browsed, but not changed, in a read-only project", async () => {
    const { view } = mount(withResults(figure), { writable: false });
    await openResults(view, "EXP-001");
    expect(treeIn(view, "EXP-001")).not.toBeNull();
    expect(rowOf(view, "EXP-001").querySelector("form")).toBeNull();
  });

  it("closes on Escape and returns focus to its control", async () => {
    const { view } = mount(withResults(figure));
    await openResults(view, "EXP-001");
    const tree = treeIn(view, "EXP-001");
    if (tree === null) throw new Error("not open");
    await act(async () => {
      tree.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Escape",
          bubbles: true,
          cancelable: true,
        }),
      );
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(treeIn(view, "EXP-001")).toBeNull();
    expect(document.activeElement).toBe(resultsControl(view, "EXP-001"));
  });
});
