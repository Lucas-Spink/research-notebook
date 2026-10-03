import { act } from "react";
import { describe, expect, it } from "vitest";
import { selectLabel } from "../messages";
import { sampleNotebook } from "../model/fakeApi";
import {
  editControl,
  mountNotebook,
  openCell,
  prepareInteractiveTable,
  rowOf,
} from "./tableTesting";

/**
 * S6-T01: choosing a cell outlines that cell alone; it does not highlight its
 * row. A cell being edited has a stronger outline, and a row is highlighted
 * only when it is picked on purpose, by its title.
 */

const { state } = sampleNotebook();
prepareInteractiveTable();

const selectedCells = (view: HTMLElement) => [
  ...view.querySelectorAll(".wtable__cell--selected"),
];
const highlightedRows = (view: HTMLElement) => [
  ...view.querySelectorAll(".wtable__row--selected"),
];

describe("cell selection (S6-T01)", () => {
  it("shows no selection until a cell is chosen", () => {
    const { view } = mountNotebook(state);
    expect(selectedCells(view)).toHaveLength(0);
    expect(highlightedRows(view)).toHaveLength(0);
  });

  it("outlines only the chosen cell, and highlights no row", () => {
    const { view } = mountNotebook(state);
    const control = rowOf(view, "EXP-001").querySelector(
      editControl("methods"),
    );
    if (!(control instanceof HTMLElement)) throw new Error("no cell");
    act(() => control.focus());

    const selected = selectedCells(view);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.contains(control)).toBe(true);
    expect(highlightedRows(view)).toHaveLength(0);
  });

  it("moves the outline when another cell is chosen", () => {
    const { view } = mountNotebook(state);
    const first = rowOf(view, "EXP-001").querySelector(editControl("methods"));
    const second = rowOf(view, "EXP-002").querySelector(
      editControl("interpretation"),
    );
    if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement))
      throw new Error("no cells");
    act(() => first.focus());
    act(() => second.focus());
    const selected = selectedCells(view);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.contains(second)).toBe(true);
  });

  it("gives the cell being edited the stronger state, and still no row highlight", async () => {
    const { view } = mountNotebook(state);
    await openCell(view, "EXP-001", "methods");
    const editing = view.querySelectorAll(".wtable__cell--editing");
    expect(editing).toHaveLength(1);
    expect(editing[0]?.querySelector(".ProseMirror")).not.toBeNull();
    expect(selectedCells(view)).toHaveLength(0);
    expect(highlightedRows(view)).toHaveLength(0);
    // The row is still the one the ribbon acts on, without being highlighted.
    expect(
      rowOf(view, "EXP-001")
        .querySelector(`button[aria-label="${selectLabel("EXP-001")}"]`)
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("highlights a row only when it is picked by its title", () => {
    const { view } = mountNotebook(state);
    const title = rowOf(view, "EXP-002").querySelector(
      `button[aria-label="${selectLabel("EXP-002")}"]`,
    );
    if (title === null) throw new Error("no title");
    act(() => {
      title.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(highlightedRows(view)).toHaveLength(1);
    expect(highlightedRows(view)[0]).toBe(rowOf(view, "EXP-002"));
  });
});
