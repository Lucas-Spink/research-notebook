import type {
  ExperimentChanges,
  NotebookState,
} from "@research-notebook/format";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { selectLabel, statusOfLabel, titleOfLabel } from "../messages";
import { sampleNotebook } from "../model/fakeApi";
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
 * FR-TBL-11 (ADR-0043): an experiment's title and status edit in place in
 * the Experiment column. Status saves when chosen; the title opens as a text
 * box on double-click or F2, saves on Enter or on leaving the cell, and is
 * left as it was on Escape.
 */

const { state, one } = sampleNotebook();

prepareInteractiveTable();

type Edit = [string, ExperimentChanges];

function mount(
  from: NotebookState = state,
  overrides: Partial<NotebookModel> = {},
  outcome = true,
) {
  const edits: Edit[] = [];
  const sections: string[] = [];
  const mounted = mountNotebook(from, {
    actions: {
      ...stubActions,
      editExperiment: (id, changes) => {
        edits.push([id, changes]);
        return Promise.resolve(outcome);
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

function titleButton(view: HTMLElement, ref: string): HTMLElement {
  const found = rowOf(view, ref).querySelector(
    `button[aria-label="${selectLabel(ref)}"]`,
  );
  if (!(found instanceof HTMLElement)) throw new Error(`no title for ${ref}`);
  return found;
}

function titleInput(view: HTMLElement, ref: string): HTMLInputElement | null {
  const found = rowOf(view, ref).querySelector(
    `input[aria-label="${titleOfLabel(ref)}"]`,
  );
  return found instanceof HTMLInputElement ? found : null;
}

function statusSelect(
  view: HTMLElement,
  ref: string,
): HTMLSelectElement | null {
  const found = rowOf(view, ref).querySelector(
    `select[aria-label="${statusOfLabel(ref)}"]`,
  );
  return found instanceof HTMLSelectElement ? found : null;
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function startRename(view: HTMLElement, ref: string) {
  act(() => {
    titleButton(view, ref).dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true }),
    );
  });
  await settle();
}

/**
 * Types `value` into an input the way React sees a change: through the
 * prototype's own setter (React tracks the instance's), then an input event.
 */
function setValue(input: HTMLInputElement, value: string) {
  act(() => {
    Reflect.set(HTMLInputElement.prototype, "value", value, input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function key(target: Element, name: string) {
  act(() => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: name,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await settle();
}

describe("title and status in place (FR-TBL-11)", () => {
  it("saves a status as soon as it is chosen", async () => {
    const { view, edits } = mount();
    const select = statusSelect(view, "EXP-001");
    if (select === null) throw new Error("no status select");
    act(() => {
      select.value = "running";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    expect(edits).toEqual([[one, { status: "running" }]]);
  });

  it("opens the title as a text box on double-click, and saves it on Enter", async () => {
    const { view, edits } = mount();
    await startRename(view, "EXP-001");
    const input = titleInput(view, "EXP-001");
    if (input === null) throw new Error("no title input");
    expect(document.activeElement).toBe(input);
    setValue(input, "Renamed in place");
    await key(input, "Enter");
    expect(edits).toEqual([[one, { title: "Renamed in place" }]]);
    expect(titleInput(view, "EXP-001")).toBeNull();
    expect(document.activeElement).toBe(titleButton(view, "EXP-001"));
  });

  it("opens the title on F2 as well", async () => {
    const { view } = mount();
    act(() => titleButton(view, "EXP-001").focus());
    await key(titleButton(view, "EXP-001"), "F2");
    expect(titleInput(view, "EXP-001")).not.toBeNull();
  });

  it("leaves the title as it was on Escape, saving nothing", async () => {
    const { view, edits } = mount();
    await startRename(view, "EXP-001");
    const input = titleInput(view, "EXP-001");
    if (input === null) throw new Error("no title input");
    setValue(input, "Never saved");
    await key(input, "Escape");
    expect(edits).toEqual([]);
    expect(titleInput(view, "EXP-001")).toBeNull();
    expect(document.activeElement).toBe(titleButton(view, "EXP-001"));
  });

  it("saves the title when focus leaves the cell", async () => {
    const { view, edits } = mount();
    await startRename(view, "EXP-001");
    const input = titleInput(view, "EXP-001");
    if (input === null) throw new Error("no title input");
    setValue(input, "Saved on leaving");
    act(() => titleButton(view, "EXP-002").focus());
    await settle();
    expect(edits).toEqual([[one, { title: "Saved on leaving" }]]);
  });

  it("saves nothing when the title is unchanged", async () => {
    const { view, edits } = mount();
    await startRename(view, "EXP-001");
    const input = titleInput(view, "EXP-001");
    if (input === null) throw new Error("no title input");
    await key(input, "Enter");
    expect(edits).toEqual([]);
    expect(titleInput(view, "EXP-001")).toBeNull();
  });

  it("keeps the text box open when the title is refused, so it can be corrected", async () => {
    const { view, edits } = mount(state, {}, false);
    await startRename(view, "EXP-001");
    const input = titleInput(view, "EXP-001");
    if (input === null) throw new Error("no title input");
    setValue(input, " ");
    await key(input, "Enter");
    expect(edits).toHaveLength(1);
    expect(titleInput(view, "EXP-001")?.value).toBe(" ");
  });

  it("saves and closes an open section editor before renaming", async () => {
    const { view, sections } = mount();
    await openCell(view, "EXP-001", "methods");
    typeInto(tableOf(view), "Typed before renaming. ");
    await startRename(view, "EXP-002");
    expect(sections).toHaveLength(1);
    expect(sections[0]).toContain("Typed before renaming.");
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(0);
    expect(titleInput(view, "EXP-002")).not.toBeNull();
  });

  it("shows title and status as plain text in a read-only project", async () => {
    const { view } = mount(state, { writable: false });
    expect(statusSelect(view, "EXP-001")).toBeNull();
    await startRename(view, "EXP-001");
    expect(titleInput(view, "EXP-001")).toBeNull();
  });
});
