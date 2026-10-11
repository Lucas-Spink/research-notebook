import { act } from "react";
import { describe, expect, it } from "vitest";
import { deleteQuestionWarning, messages } from "../messages";
import { sampleNotebook } from "../model/fakeApi";
import { stubActions } from "../model/testModel";
import {
  mountNotebook,
  prepareInteractiveTable,
  rowOf,
  tableOf,
} from "./tableTesting";

/**
 * Moving a question or experiment to the bin is a button on its own row, not
 * only a ribbon menu entry. It asks first and then calls the same action as
 * the ribbon, which moves the item to `.trash/` and deletes nothing.
 */

const { state, first, one } = sampleNotebook();

prepareInteractiveTable();

function mount(readOnly = false) {
  const moved: string[] = [];
  const mounted = mountNotebook(state, {
    writable: !readOnly,
    actions: {
      ...stubActions,
      removeExperiment: (id) => {
        moved.push(`experiment:${id}`);
        return Promise.resolve(true);
      },
      removeQuestion: (id) => {
        moved.push(`question:${id}`);
        return Promise.resolve(true);
      },
    },
  });
  return { ...mounted, moved };
}

const click = (element: Element | null | undefined) =>
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

function binButton(root: Element, ref: string): HTMLButtonElement | null {
  const found = root.querySelector(
    `button[aria-label="${messages.moveToBinLabel(ref)}"]`,
  );
  return found instanceof HTMLButtonElement ? found : null;
}

function confirmIn(root: Element): HTMLButtonElement | null {
  const group = root.querySelector('[role="group"]');
  const found = [...(group?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === messages.confirmDelete,
  );
  return found instanceof HTMLButtonElement ? found : null;
}

describe("Move to bin on an experiment row", () => {
  it("is on the row, named for the experiment", () => {
    const { view } = mount();
    const button = binButton(rowOf(view, "EXP-001"), "EXP-001");
    expect(button?.textContent).toContain("Move to bin");
  });

  it("asks first, says it can be restored, and does nothing until confirmed", () => {
    const { view, moved } = mount();
    const row = rowOf(view, "EXP-001");
    click(binButton(row, "EXP-001"));
    expect(moved).toEqual([]);
    expect(row.textContent).toContain("You can restore it from the Bin");
    click(row.querySelector('[role="group"] button:last-of-type'));
    expect(moved).toEqual([]);
    expect(binButton(row, "EXP-001")).not.toBeNull();
  });

  it("moves that experiment to the bin when confirmed", async () => {
    const { view, moved } = mount();
    const row = rowOf(view, "EXP-001");
    click(binButton(row, "EXP-001"));
    click(confirmIn(row));
    await act(async () => Promise.resolve());
    expect(moved).toEqual([`experiment:${one}`]);
  });

  it("is not offered in a read-only project", () => {
    const { view } = mount(true);
    expect(binButton(rowOf(view, "EXP-001"), "EXP-001")).toBeNull();
  });
});

describe("Move to bin on a question row", () => {
  const header = (view: HTMLElement) => {
    const found = tableOf(view).querySelector(".wtable__question");
    if (!(found instanceof HTMLElement)) throw new Error("no question row");
    return found;
  };

  it("is on the question's header, and says its experiments stay", () => {
    const { view } = mount();
    const row = header(view);
    const ref = row.querySelector("strong")?.textContent ?? "";
    click(binButton(row, ref));
    expect(row.textContent).toContain(deleteQuestionWarning(ref, 2));
  });

  it("moves that question to the bin when confirmed", async () => {
    const { view, moved } = mount();
    const row = header(view);
    const ref = row.querySelector("strong")?.textContent ?? "";
    click(binButton(row, ref));
    click(confirmIn(row));
    await act(async () => Promise.resolve());
    expect(moved).toEqual([`question:${first}`]);
  });

  it("is not offered in a read-only project", () => {
    const { view } = mount(true);
    expect(header(view).querySelector(".wtable__bin")).toBeNull();
  });
});
