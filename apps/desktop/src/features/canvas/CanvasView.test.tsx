import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { CanvasView } from "./CanvasView";
import { A, B, FOLDER, fakeApi, fileOf, pathOf, textOf } from "./model/fakeApi";
import type { CanvasApi } from "./model/store";
import {
  buttonNamed,
  click,
  fakeCards,
  flush,
  mount,
  stubFlowEnvironment,
  type,
  unmount,
} from "./testSupport";
import { useCanvases } from "./useCanvases";

/**
 * ADR-0064, phase 1: the canvas view's three regions, the picker for the
 * project's canvases (new, rename, delete) and the side panels that resize and
 * collapse. The canvases are real files behind a fake of the notebook commands.
 */

beforeAll(stubFlowEnvironment);
afterEach(unmount);

function Harness({
  api,
  writable = true,
}: {
  api: CanvasApi;
  writable?: boolean;
}) {
  const canvases = useCanvases({
    api,
    folder: FOLDER,
    writable,
    enabled: true,
  });
  return <CanvasView canvases={canvases} cards={fakeCards()} />;
}

async function open(
  files: Record<string, string>,
  options: { writable?: boolean; faults?: Parameters<typeof fakeApi>[1] } = {},
) {
  const fake = fakeApi(files, options.faults);
  const view = mount(
    <Harness api={fake.api} writable={options.writable ?? true} />,
  );
  await flush();
  return { view, ...fake };
}

const picker = (view: HTMLElement) => {
  const select = view.querySelector("select");
  if (!(select instanceof HTMLSelectElement)) throw new Error("no picker");
  return select;
};
const names = (view: HTMLElement) =>
  [...picker(view).options].map((option) => option.textContent);
const separator = (view: HTMLElement, label: string) => {
  const found = view.querySelector(`[role="separator"][aria-label="${label}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no ${label}`);
  return found;
};

describe("the canvas view", () => {
  it("has results on the left, the canvas in the middle and writing on the right", async () => {
    const { view } = await open({ [pathOf(A)]: textOf(A, "Compare") });
    const headings = [...view.querySelectorAll("aside h3")].map(
      (h) => h.textContent,
    );
    expect(headings).toEqual(["Results", "Writing"]);
    expect(
      view.querySelector('[aria-label="Canvas"][role="region"]'),
    ).not.toBeNull();
    expect(view.textContent).toContain("Zoom: 100%");
    expect(buttonNamed(view, "Fit to view")).toBeDefined();
    expect(buttonNamed(view, "Reset view")).toBeDefined();
  });

  it("lists the project's canvases by name and shows the first", async () => {
    const { view } = await open({
      [pathOf(A)]: textOf(A, "Zebra"),
      [pathOf(B)]: textOf(B, "Apple"),
    });
    expect(names(view)).toEqual(["Apple", "Zebra"]);
    expect(picker(view).value).toBe(fileOf(B));
  });

  it("says so, and offers to make one, when the project has no canvases", async () => {
    const { view } = await open({});
    expect(view.textContent).toContain("This project has no canvases yet.");
    expect(
      view.querySelector('[role="region"][aria-label="Canvas"]'),
    ).toBeNull();
    expect(buttonNamed(view, "New canvas").disabled).toBe(false);
    expect(buttonNamed(view, "Rename").disabled).toBe(true);
    expect(buttonNamed(view, "Delete").disabled).toBe(true);
  });

  it("explains a canvas file it cannot read and does not offer to rename it", async () => {
    const { view, disk } = await open({ [pathOf(A)]: "{ not json" });
    expect(names(view)).toEqual([`${fileOf(A)} (cannot be read)`]);
    expect(view.textContent).toContain("could not be read");
    expect(buttonNamed(view, "Rename").disabled).toBe(true);
    expect(buttonNamed(view, "Delete").disabled).toBe(false);
    expect(disk[pathOf(A)]).toBe("{ not json");
  });

  it("is read-only when the project is: canvases can be seen, not made or changed", async () => {
    const { view, writes } = await open(
      { [pathOf(A)]: textOf(A, "Compare") },
      { writable: false },
    );
    expect(view.textContent).toContain("This project is read-only");
    for (const label of ["New canvas", "Rename", "Delete"]) {
      expect(buttonNamed(view, label).disabled, label).toBe(true);
    }
    expect(writes).toEqual([]);
  });
});

describe("making, renaming and deleting canvases", () => {
  it("makes a new canvas with the name typed, and shows it", async () => {
    const { view, disk } = await open({ [pathOf(A)]: textOf(A, "Compare") });
    click(buttonNamed(view, "New canvas"));
    const input = view.querySelector("input");
    if (!(input instanceof HTMLInputElement)) throw new Error("no name field");
    expect(input.value).toBe("Untitled canvas");
    type(input, "Figure 2");
    click(buttonNamed(view, "Create canvas"));
    await flush();
    expect(names(view)).toContain("Figure 2");
    expect(picker(view).selectedOptions[0]?.textContent).toBe("Figure 2");
    expect(Object.keys(disk)).toHaveLength(2);
  });

  it("does not make one with an empty name", async () => {
    const { view, writes } = await open({});
    click(buttonNamed(view, "New canvas"));
    const input = view.querySelector("input");
    if (!(input instanceof HTMLInputElement)) throw new Error("no name field");
    type(input, "   ");
    expect(buttonNamed(view, "Create canvas").disabled).toBe(true);
    expect(writes).toEqual([]);
  });

  it("cancels without writing anything", async () => {
    const { view, writes } = await open({});
    click(buttonNamed(view, "New canvas"));
    click(buttonNamed(view, "Cancel"));
    expect(view.querySelector("input")).toBeNull();
    expect(writes).toEqual([]);
  });

  it("renames the canvas shown, keeping the list in order", async () => {
    const { view, disk } = await open({
      [pathOf(A)]: textOf(A, "Alpha"),
      [pathOf(B)]: textOf(B, "Beta"),
    });
    click(buttonNamed(view, "Rename"));
    const input = view.querySelector("input");
    if (!(input instanceof HTMLInputElement)) throw new Error("no name field");
    expect(input.value).toBe("Alpha");
    type(input, "Zulu");
    click(buttonNamed(view, "Save name"));
    await flush();
    expect(names(view)).toEqual(["Beta", "Zulu"]);
    expect(disk[pathOf(A)]).toBe(textOf(A, "Zulu"));
  });

  it("reports a change made outside the application and reloads instead of overwriting", async () => {
    const { view, disk } = await open({ [pathOf(A)]: textOf(A, "Alpha") });
    disk[pathOf(A)] = textOf(A, "Edited elsewhere");
    click(buttonNamed(view, "Rename"));
    const input = view.querySelector("input");
    if (!(input instanceof HTMLInputElement)) throw new Error("no name field");
    type(input, "Mine");
    click(buttonNamed(view, "Save name"));
    await flush();
    expect(view.textContent).toContain("changed outside the application");
    expect(disk[pathOf(A)]).toBe(textOf(A, "Edited elsewhere"));
    // The form stays open with what was typed, so the person can try again on the fresh file.
    expect(view.querySelector("input")?.value).toBe("Mine");
    click(buttonNamed(view, "Cancel"));
    expect(names(view)).toEqual(["Edited elsewhere"]);
  });

  it("asks before deleting, then moves only that canvas to the trash", async () => {
    const { view, disk, trashed } = await open({
      [pathOf(A)]: textOf(A, "Alpha"),
      [pathOf(B)]: textOf(B, "Beta"),
    });
    click(buttonNamed(view, "Delete"));
    expect(view.textContent).toContain("Delete “Alpha”?");
    expect(view.textContent).toContain(
      "Results, experiments and their text are not touched",
    );
    expect(trashed).toEqual([]);
    click(buttonNamed(view, "Move to trash"));
    await flush();
    expect(trashed).toEqual([pathOf(A)]);
    expect(Object.keys(disk)).toEqual([pathOf(B)]);
    expect(names(view)).toEqual(["Beta"]);
  });

  it("keeps the canvas when the person cancels the deletion", async () => {
    const { view, trashed } = await open({ [pathOf(A)]: textOf(A, "Alpha") });
    click(buttonNamed(view, "Delete"));
    click(buttonNamed(view, "Cancel"));
    expect(trashed).toEqual([]);
    expect(names(view)).toEqual(["Alpha"]);
  });
});

describe("the side panels", () => {
  it("hide and show with their buttons, giving the canvas the room", async () => {
    const { view } = await open({ [pathOf(A)]: textOf(A, "Compare") });
    click(buttonNamed(view, "Hide results"));
    expect(view.querySelectorAll("aside")).toHaveLength(1);
    expect(buttonNamed(view, "Show results").getAttribute("aria-pressed")).toBe(
      "false",
    );
    click(buttonNamed(view, "Hide writing"));
    expect(view.querySelectorAll("aside")).toHaveLength(0);
    click(buttonNamed(view, "Show results"));
    click(buttonNamed(view, "Show writing"));
    expect(view.querySelectorAll("aside")).toHaveLength(2);
  });

  it("resize from the keyboard, within their limits", async () => {
    const { view } = await open({ [pathOf(A)]: textOf(A, "Compare") });
    const results = separator(view, "Resize the results panel");
    const before = Number(results.getAttribute("aria-valuenow"));
    results.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await flush();
    expect(
      Number(
        separator(view, "Resize the results panel").getAttribute(
          "aria-valuenow",
        ),
      ),
    ).toBe(before + 16);
    const writing = separator(view, "Resize the writing panel");
    writing.dispatchEvent(
      new KeyboardEvent("keydown", { key: "End", bubbles: true }),
    );
    await flush();
    expect(
      separator(view, "Resize the writing panel").getAttribute("aria-valuenow"),
    ).toBe(writing.getAttribute("aria-valuemax"));
  });

  it("show what the rest of the application gives them", async () => {
    const fake = fakeApi({ [pathOf(A)]: textOf(A, "Compare") });
    function WithPanels() {
      const canvases = useCanvases({
        api: fake.api,
        folder: FOLDER,
        writable: true,
        enabled: true,
      });
      return (
        <CanvasView
          canvases={canvases}
          cards={fakeCards()}
          resultsPanel={<p>tree goes here</p>}
          writingPanel={<p>editors go here</p>}
        />
      );
    }
    const view = mount(<WithPanels />);
    await flush();
    expect(view.textContent).toContain("tree goes here");
    expect(view.textContent).toContain("editors go here");
    expect(view.textContent).not.toContain("will be listed here");
  });
});
