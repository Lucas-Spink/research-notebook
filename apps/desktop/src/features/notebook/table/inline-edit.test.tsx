import type {
  NotebookState,
  RecognisedSectionKey,
} from "@research-notebook/format";
import { Editor } from "@tiptap/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { columnLabel, editLabel, selectLabel } from "../messages";
import { sampleNotebook } from "../model/fakeApi";
import { stubActions, testModel } from "../model/testModel";
import { NotebookView } from "../NotebookView";
import type { NotebookModel } from "../useNotebook";

/**
 * S4-G11 "Inline edit saves" (ADR-0043, FR-TBL-11): a section edited in a
 * table cell is saved through the same action, with the same text, as the
 * same edit in the expanded view, and switching cells saves first.
 */

const { state, one } = sampleNotebook();
const first = state.experiments[0];
if (first === undefined) throw new Error("sample");

type Saved = [string, RecognisedSectionKey, string];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

// jsdom lays nothing out, so every element measures 0 × 0 and the
// virtualiser would draw no rows. Give the table's scroll area a window's
// size, as a real layout would; nothing else changes.
const sized = { offsetHeight: 720, offsetWidth: 1600 };
const originals = Object.keys(sized).map(
  (name): [string, PropertyDescriptor | undefined] => [
    name,
    Object.getOwnPropertyDescriptor(HTMLElement.prototype, name),
  ],
);
beforeAll(() => {
  for (const [name, size] of Object.entries(sized)) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      get(this: HTMLElement) {
        return this.classList.contains("wtable") ? size : 0;
      },
    });
  }
});
afterAll(() => {
  for (const [name, descriptor] of originals) {
    if (descriptor !== undefined) {
      Object.defineProperty(HTMLElement.prototype, name, descriptor);
    }
  }
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function mount(
  from: NotebookState = state,
  overrides: Partial<NotebookModel> = {},
) {
  const saved: Saved[] = [];
  const notebook = testModel(from, {
    actions: {
      ...stubActions,
      editExperimentSection: (id, key, text) => {
        saved.push([id, key, text]);
        return Promise.resolve({ ok: true });
      },
    },
    ...overrides,
  });
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<NotebookView notebook={notebook} folder={1} />));
  return { view: container, saved };
}

function table(view: HTMLElement): HTMLElement {
  const found = view.querySelector(".wtable");
  if (!(found instanceof HTMLElement)) throw new Error("no table");
  return found;
}

function details(view: HTMLElement): HTMLElement {
  const found = view.querySelector(".notebook__details");
  if (!(found instanceof HTMLElement)) throw new Error("no details panel");
  return found;
}

function rowOf(view: HTMLElement, ref: string): HTMLElement {
  const button = table(view).querySelector(
    `button[aria-label="${selectLabel(ref)}"]`,
  );
  const row = button?.closest('[role="row"]');
  if (!(row instanceof HTMLElement)) throw new Error(`no row for ${ref}`);
  return row;
}

async function openCell(
  view: HTMLElement,
  ref: string,
  key: RecognisedSectionKey,
) {
  const cell = rowOf(view, ref).querySelector(
    `[role="button"][aria-label="${editLabel(columnLabel(key))}"]`,
  );
  if (cell === null) throw new Error(`no editable ${key} cell for ${ref}`);
  await act(async () => {
    cell.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

/** Changes the live editor's document the way typing would, through its own commands. */
function typeInto(place: HTMLElement, text: string) {
  const pm = place.querySelector(".ProseMirror");
  const editor: unknown = pm === null ? null : Reflect.get(pm, "editor");
  if (!(editor instanceof Editor)) throw new Error("no live editor");
  act(() => {
    editor.commands.insertContent(text);
  });
}

describe("inline-edit (S4-G11)", () => {
  it("opens a cell for editing in place: one editor, in the table, none in the details panel", async () => {
    const { view } = mount();
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(0);
    await openCell(view, "EXP-001", "methods");
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(1);
    expect(
      rowOf(view, "EXP-001").querySelectorAll(".ProseMirror"),
    ).toHaveLength(1);
    expect(details(view).querySelectorAll(".ProseMirror")).toHaveLength(0);
  });

  it("selects the row, whose sections the details panel then shows static", async () => {
    const { view } = mount();
    await openCell(view, "EXP-001", "interpretation");
    expect(
      rowOf(view, "EXP-001")
        .querySelector(`button[aria-label="${selectLabel("EXP-001")}"]`)
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(details(view).querySelectorAll(".expanded__field")).toHaveLength(3);
    expect(details(view).querySelectorAll(".ProseMirror")).toHaveLength(0);
  });

  it("saves what was typed as soon as another cell is opened, without waiting", async () => {
    const { view, saved } = mount();
    await openCell(view, "EXP-001", "methods");
    typeInto(table(view), "Typed in the table. ");
    expect(saved).toEqual([]);
    await openCell(view, "EXP-002", "results_notes");
    expect(saved).toHaveLength(1);
    expect(saved[0]?.[0]).toBe(one);
    expect(saved[0]?.[1]).toBe("methods");
    expect(saved[0]?.[2]).toContain("Typed in the table.");
    expect(
      rowOf(view, "EXP-002").querySelectorAll(".ProseMirror"),
    ).toHaveLength(1);
  });

  it("saves the same text through the same action as the same edit in the expanded view", async () => {
    const inTable = mount();
    await openCell(inTable.view, "EXP-001", "methods");
    typeInto(table(inTable.view), "Same words. ");
    await openCell(inTable.view, "EXP-001", "interpretation");
    act(() => root?.unmount());
    root = null;
    container?.remove();

    const inDetails = mount();
    const select = rowOf(inDetails.view, "EXP-001").querySelector(
      `button[aria-label="${selectLabel("EXP-001")}"]`,
    );
    act(() => {
      select?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    typeInto(details(inDetails.view), "Same words. ");
    const interpretation = [
      ...details(inDetails.view).querySelectorAll(".expanded__field"),
    ]
      .find((f) => f.querySelector("label")?.textContent === "Interpretation")
      ?.querySelector('[role="button"]');
    await act(async () => {
      interpretation?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });

    expect(inTable.saved).toHaveLength(1);
    expect(inTable.saved).toEqual(inDetails.saved);
  });

  it("offers no editing in a read-only project", async () => {
    const { view } = mount(state, { writable: false });
    expect(
      table(view).querySelector(
        `[role="button"][aria-label="${editLabel(columnLabel("methods"))}"]`,
      ),
    ).toBeNull();
    const cell = rowOf(view, "EXP-001").querySelectorAll('[role="cell"]')[1];
    await act(async () => {
      cell?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    expect(table(view).querySelectorAll(".ProseMirror")).toHaveLength(0);
  });

  it("offers no editing for an experiment left read-only because another file has its ID", () => {
    const duplicate: NotebookState = {
      ...state,
      experiments: [
        ...state.experiments,
        { ...first, folder: `${first.folder}-copy` },
      ],
    };
    const { view } = mount(duplicate);
    const rows = [...table(view).querySelectorAll('[role="row"]')].filter(
      (row) =>
        row.querySelector(`button[aria-label="${selectLabel("EXP-001")}"]`) !==
        null,
    );
    expect(rows).toHaveLength(2);
    const editable = rows.map(
      (row) =>
        row.querySelectorAll(
          `[role="button"][aria-label="${editLabel(columnLabel("methods"))}"]`,
        ).length,
    );
    expect(editable.sort()).toEqual([0, 1]);
  });
});
