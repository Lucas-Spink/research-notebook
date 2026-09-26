import type { RecognisedSectionKey } from "@research-notebook/format";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { selectLabel } from "../messages";
import { sampleNotebook } from "../model/fakeApi";
import {
  editControl,
  mountNotebook,
  prepareInteractiveTable,
  rowOf,
  tableOf,
  typeInto,
} from "./tableTesting";

/**
 * FR-TBL-11 and ADR-0043 point 5: the table is an ARIA grid with one tab
 * stop, moved by the arrow keys; Enter or F2 opens a section's editor with
 * the caret in it, and Escape saves, closes it and returns focus to the
 * cell. Keys typed inside an editor are the editor's own.
 */

const { state, one } = sampleNotebook();

prepareInteractiveTable();

function selectButton(view: HTMLElement, ref: string): HTMLElement {
  const found = rowOf(view, ref).querySelector(
    `button[aria-label="${selectLabel(ref)}"]`,
  );
  if (!(found instanceof HTMLElement)) throw new Error(`no select for ${ref}`);
  return found;
}

function editOf(
  view: HTMLElement,
  ref: string,
  key: RecognisedSectionKey,
): HTMLElement {
  const found = rowOf(view, ref).querySelector(editControl(key));
  if (!(found instanceof HTMLElement)) throw new Error(`no ${key} for ${ref}`);
  return found;
}

function focus(element: HTMLElement) {
  act(() => element.focus());
}

async function press(target: Element, key: string) {
  await act(async () => {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
    // Opening and closing an editor resolve after a save settles.
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Every element in the experiment rows that Tab would stop on. */
function tabStops(view: HTMLElement): Element[] {
  return [
    ...tableOf(view).querySelectorAll(
      '[role="gridcell"][tabindex="0"], [role="gridcell"] [tabindex="0"], [role="gridcell"] button:not([tabindex])',
    ),
  ];
}

describe("keyboard grid (ADR-0043)", () => {
  it("is a grid of gridcells", () => {
    const { view } = mountNotebook(state);
    expect(view.querySelector('[role="grid"]')).not.toBeNull();
    expect(view.querySelector('[role="table"]')).toBeNull();
    expect(
      rowOf(view, "EXP-001").querySelectorAll('[role="gridcell"]').length,
    ).toBeGreaterThan(1);
  });

  it("has one tab stop, on the first experiment's first cell to start with", () => {
    const { view } = mountNotebook(state);
    expect(tabStops(view)).toEqual([selectButton(view, "EXP-001")]);
  });

  it("moves focus, and the one tab stop, with the arrow keys", async () => {
    const { view } = mountNotebook(state);
    focus(selectButton(view, "EXP-001"));
    await press(selectButton(view, "EXP-001"), "ArrowRight");
    expect(document.activeElement).toBe(editOf(view, "EXP-001", "methods"));
    await press(editOf(view, "EXP-001", "methods"), "ArrowDown");
    expect(document.activeElement).toBe(editOf(view, "EXP-002", "methods"));
    expect(tabStops(view)).toEqual([editOf(view, "EXP-002", "methods")]);
    await press(editOf(view, "EXP-002", "methods"), "Home");
    expect(document.activeElement).toBe(selectButton(view, "EXP-002"));
  });

  it("moves the tab stop to a cell that gets focus by click or Tab", () => {
    const { view } = mountNotebook(state);
    focus(editOf(view, "EXP-002", "interpretation"));
    expect(tabStops(view)).toEqual([editOf(view, "EXP-002", "interpretation")]);
  });

  it("opens a section on Enter, with the caret in its editor", async () => {
    const { view } = mountNotebook(state);
    focus(editOf(view, "EXP-001", "methods"));
    await press(editOf(view, "EXP-001", "methods"), "Enter");
    const editor = rowOf(view, "EXP-001").querySelector(".ProseMirror");
    expect(editor).not.toBeNull();
    // Tiptap places the caret a few tasks after the editor mounts.
    await vi.waitFor(() => {
      expect(editor?.contains(document.activeElement)).toBe(true);
    });
  });

  it("opens a section on F2 too", async () => {
    const { view } = mountNotebook(state);
    focus(editOf(view, "EXP-001", "interpretation"));
    await press(editOf(view, "EXP-001", "interpretation"), "F2");
    expect(
      rowOf(view, "EXP-001").querySelectorAll(".ProseMirror"),
    ).toHaveLength(1);
  });

  it("saves, closes the editor and returns focus to the cell on Escape", async () => {
    const { view, saved } = mountNotebook(state);
    focus(editOf(view, "EXP-001", "methods"));
    await press(editOf(view, "EXP-001", "methods"), "Enter");
    typeInto(tableOf(view), "Typed, then Escape. ");
    const editor = rowOf(view, "EXP-001").querySelector(".ProseMirror");
    if (editor === null) throw new Error("no editor");
    await press(editor, "Escape");
    expect(saved).toHaveLength(1);
    expect(saved[0]?.[0]).toBe(one);
    expect(saved[0]?.[2]).toContain("Typed, then Escape.");
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(0);
    expect(document.activeElement).toBe(editOf(view, "EXP-001", "methods"));
  });

  it("leaves arrow keys typed in an editor to the editor", async () => {
    const { view } = mountNotebook(state);
    focus(editOf(view, "EXP-001", "methods"));
    await press(editOf(view, "EXP-001", "methods"), "Enter");
    const editor = rowOf(view, "EXP-001").querySelector(".ProseMirror");
    if (editor === null) throw new Error("no editor");
    await vi.waitFor(() => {
      expect(editor.contains(document.activeElement)).toBe(true);
    });
    await press(editor, "ArrowDown");
    expect(
      rowOf(view, "EXP-001").querySelectorAll(".ProseMirror"),
    ).toHaveLength(1);
    expect(editor.contains(document.activeElement)).toBe(true);
  });
});
