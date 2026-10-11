import { act } from "react";
import { describe, expect, it } from "vitest";
import { selectLabel } from "../messages";
import { sampleNotebook } from "../model/fakeApi";
import { stubActions } from "../model/testModel";
import {
  detailsOf,
  mountNotebook,
  prepareInteractiveTable,
  tableOf,
} from "../table/tableTesting";

/**
 * Moving a question or experiment to the bin is a command in the Experiments
 * tab of the ribbon. It is faded until something is selected, then accented,
 * asks before it moves anything, and moves it to `.trash/` (nothing is deleted).
 */

const { state, first, one } = sampleNotebook();

prepareInteractiveTable();

function mount(writable = true) {
  const moved: string[] = [];
  const mounted = mountNotebook(state, {
    writable,
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
  click(
    [...mounted.view.querySelectorAll('[role="tab"]')].find(
      (tab) => tab.textContent === "Experiments",
    ),
  );
  return { ...mounted, moved };
}

const click = (element: Element | null | undefined) =>
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

const toolbar = (view: HTMLElement) => view.querySelector('[role="toolbar"]');

function binCommand(view: HTMLElement): HTMLButtonElement {
  const found = [...(toolbar(view)?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === "Move to bin",
  );
  if (!(found instanceof HTMLButtonElement)) throw new Error("no command");
  return found;
}

function select(view: HTMLElement, ref: string) {
  const button = tableOf(view).querySelector(
    `button[aria-label="${selectLabel(ref)}"]`,
  );
  if (button === null) throw new Error(`no ${ref}`);
  click(button);
}

const confirmButton = (view: HTMLElement) =>
  [...(toolbar(view)?.querySelectorAll('[role="group"] button') ?? [])].find(
    (b) => b.textContent === "Move to bin",
  );

describe("Move to bin in the Experiments tab", () => {
  it("is there, faded, while nothing is selected", () => {
    const { view } = mount();
    const command = binCommand(view);
    expect(command.disabled).toBe(true);
    expect(command.className).toContain("ribbon__button--bin");
    expect(command.title).toContain("Select");
  });

  it("is enabled once an experiment is selected, and nothing moves until it is confirmed", () => {
    const { view, moved } = mount();
    select(view, "EXP-001");
    const command = binCommand(view);
    expect(command.disabled).toBe(false);
    click(command);
    expect(toolbar(view)?.textContent).toContain("EXP-001");
    expect(toolbar(view)?.textContent).toContain("restore it from the Bin");
    expect(moved).toEqual([]);
  });

  it("moves the selected experiment to the bin when confirmed", async () => {
    const { view, moved } = mount();
    select(view, "EXP-001");
    click(binCommand(view));
    click(confirmButton(view));
    await act(async () => Promise.resolve());
    expect(moved).toEqual([`experiment:${one}`]);
  });

  it("can be cancelled", () => {
    const { view, moved } = mount();
    select(view, "EXP-001");
    click(binCommand(view));
    click(
      [
        ...(toolbar(view)?.querySelectorAll('[role="group"] button') ?? []),
      ].find((b) => b.textContent === "Cancel"),
    );
    expect(moved).toEqual([]);
    expect(binCommand(view).disabled).toBe(false);
  });

  it("moves a selected question, whose experiments stay", async () => {
    const { view, moved } = mount();
    const header = tableOf(view).querySelector(".wtable__question strong");
    click(header?.closest("button"));
    expect(binCommand(view).disabled).toBe(false);
    click(binCommand(view));
    expect(toolbar(view)?.textContent).toContain("will be kept");
    click(confirmButton(view));
    await act(async () => Promise.resolve());
    expect(moved).toEqual([`question:${first}`]);
  });

  it("is not on the experiment's row any more", () => {
    const { view } = mount();
    expect(tableOf(view).textContent).not.toContain("Move to bin");
    expect(tableOf(view).querySelector(".wtable__bin")).toBeNull();
  });

  it("stays faded in a read-only project, even with something selected", () => {
    const { view } = mount(false);
    select(view, "EXP-001");
    expect(binCommand(view).disabled).toBe(true);
  });

  it("is the only way to move a question or experiment to the bin", () => {
    const { view } = mount();
    select(view, "EXP-001");
    // Not in the Details panel, for the experiment...
    const details = detailsOf(view).textContent ?? "";
    expect(details).not.toMatch(/Move to bin|Delete/);
    // ...nor for the question.
    const header = tableOf(view).querySelector(".wtable__question strong");
    click(header?.closest("button"));
    expect(detailsOf(view).textContent ?? "").not.toMatch(/Move to bin|Delete/);
    // And not under More actions in the Home tab.
    click(
      [...view.querySelectorAll('[role="tab"]')].find(
        (tab) => tab.textContent === "Home",
      ),
    );
    select(view, "EXP-001");
    const more = [...(toolbar(view)?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "More actions",
    );
    click(more);
    expect(more).toBeDefined();
    expect(document.body.textContent ?? "").not.toMatch(/Move to bin|Delete/);
  });
});
