import { act } from "react";
import { beforeAll, describe, expect, it } from "vitest";
import { stubFlowEnvironment } from "../../shared/flowTesting";
import { sampleNotebook } from "./model/fakeApi";
import {
  mountNotebook,
  openCell,
  prepareInteractiveTable,
  tableOf,
  typeInto,
} from "./table/tableTesting";

/**
 * ADR-0064, phase 1: Table and Canvas are two views of one notebook. Switching
 * keeps the project, keeps what was being typed, and does not touch the table's
 * own state. The canvases themselves are covered in `features/canvas`.
 */

const { state } = sampleNotebook();
prepareInteractiveTable();
beforeAll(stubFlowEnvironment);

const viewButton = (view: HTMLElement, label: string): HTMLButtonElement => {
  const found = [
    ...view.querySelectorAll('.workspace__views [role="group"] button'),
  ].find((button) => button.textContent === label);
  if (!(found instanceof HTMLButtonElement)) throw new Error(`no ${label}`);
  return found;
};

const choose = async (view: HTMLElement, label: string) => {
  await act(async () => {
    viewButton(view, label).dispatchEvent(
      new MouseEvent("click", { bubbles: true }),
    );
    await Promise.resolve();
  });
};

describe("switching between Table and Canvas", () => {
  it("starts on the table, with Table marked", () => {
    const { view } = mountNotebook(state);
    expect(viewButton(view, "Table").getAttribute("aria-pressed")).toBe("true");
    expect(viewButton(view, "Canvas").getAttribute("aria-pressed")).toBe(
      "false",
    );
    expect(view.querySelector(".canvas-view")).toBeNull();
    expect(tableOf(view)).toBeDefined();
  });

  it("shows the canvas view in place of the table, and the table again on the way back", async () => {
    const { view } = mountNotebook(state);
    await choose(view, "Canvas");
    expect(view.querySelector(".canvas-view")).not.toBeNull();
    expect(view.querySelector(".wtable")).toBeNull();
    expect(viewButton(view, "Canvas").getAttribute("aria-pressed")).toBe(
      "true",
    );
    await choose(view, "Table");
    expect(view.querySelector(".canvas-view")).toBeNull();
    expect(view.querySelector(".wtable")).not.toBeNull();
  });

  it("keeps the project header and the side pane while the canvas is showing", async () => {
    const { view } = mountNotebook(state);
    await choose(view, "Canvas");
    expect(view.querySelector(".project-header__title")?.textContent).toBe(
      state.project.name,
    );
    expect(view.querySelector('[role="toolbar"]')).not.toBeNull();
  });

  it("hides the Bibliography, which belongs under the table", async () => {
    const { view } = mountNotebook(state);
    expect(view.textContent).toContain("Bibliography");
    await choose(view, "Canvas");
    expect(view.querySelector(".canvas-view")).not.toBeNull();
    expect(view.textContent).not.toContain("No sources are cited");
  });

  it("saves what was being typed in the table before it goes", async () => {
    const { view, saved } = mountNotebook(state);
    await openCell(view, "EXP-001", "methods");
    typeInto(view, " more detail");
    await choose(view, "Canvas");
    expect(saved.some(([, , text]) => text.includes("more detail"))).toBe(true);
    expect(view.querySelector(".canvas-view")).not.toBeNull();
  });
});
