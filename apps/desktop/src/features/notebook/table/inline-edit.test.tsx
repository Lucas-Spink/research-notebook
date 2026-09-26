import type { NotebookState } from "@research-notebook/format";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { selectLabel } from "../messages";
import { sampleNotebook } from "../model/fakeApi";
import type { NotebookModel } from "../useNotebook";
import {
  detailsOf as details,
  editControl,
  mountNotebook,
  openCell,
  prepareInteractiveTable,
  rowOf,
  tableOf as table,
  typeInto,
  unmountNotebook,
} from "./tableTesting";

/**
 * S4-G11 "Inline edit saves" (ADR-0043, FR-TBL-11): a section edited in a
 * table cell is saved through the same action, with the same text, as the
 * same edit in the expanded view, and switching cells saves first.
 */

const { state, one } = sampleNotebook();
const first = state.experiments[0];
if (first === undefined) throw new Error("sample");

prepareInteractiveTable();

const mount = (
  from: NotebookState = state,
  overrides: Partial<NotebookModel> = {},
) => mountNotebook(from, overrides);

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
    unmountNotebook();

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
    expect(table(view).querySelector(editControl("methods"))).toBeNull();
    const cell = rowOf(view, "EXP-001").querySelectorAll(
      '[role="gridcell"]',
    )[1];
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
      (row) => row.querySelectorAll(editControl("methods")).length,
    );
    expect(editable.sort()).toEqual([0, 1]);
  });
});
