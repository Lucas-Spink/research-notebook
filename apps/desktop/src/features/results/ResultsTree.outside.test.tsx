import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupAction } from "./model/actions";
import { ids, sampleArtefacts } from "./model/sample";
import { ResultsTree } from "./ResultsTree";

/**
 * ADR-0064: a result can be dragged out of the tree onto another part of the
 * window (the canvas) without leaving its group, and pinned from its menu for
 * anyone who cannot drag. Dragging is by pointer, as in the other tree tests.
 */

type Drop = { artefactIds: string[]; x: number; y: number };

let root: Root | null = null;
let container: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  Reflect.deleteProperty(document, "elementFromPoint");
});

function mount(
  options: {
    onDrop?: (drop: Drop) => void;
    onPin?: (artefactIds: string[]) => void;
    pinned?: ReadonlySet<string>;
    disabled?: boolean;
    onAction?: (action: GroupAction) => void;
  } = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ResultsTree
        file={sampleArtefacts()}
        disabled={options.disabled ?? false}
        onAction={(action) => {
          options.onAction?.(action);
          return Promise.resolve({ ok: true });
        }}
        {...(options.onDrop === undefined
          ? {}
          : { outside: { zone: "canvas", onDrop: options.onDrop } })}
        {...(options.onPin === undefined ? {} : { onPin: options.onPin })}
        {...(options.pinned === undefined ? {} : { pinned: options.pinned })}
      />,
    ),
  );
  return container;
}

const rowNamed = (view: HTMLElement, name: string): HTMLElement => {
  const found = [
    ...view.querySelectorAll<HTMLElement>('[role="treeitem"]'),
  ].find((r) => r.querySelector(".results__name-text")?.textContent === name);
  if (found === undefined) throw new Error(`no row ${name}`);
  return found;
};

const pointer = (target: EventTarget, type: string, x: number, y: number) =>
  act(() => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
      }),
    );
  });

/** A stand-in for the canvas, which the drag looks for under the pointer. */
function zone(): HTMLElement {
  const place = document.createElement("div");
  place.dataset["dropZone"] = "canvas";
  const inner = document.createElement("span");
  place.append(inner);
  document.body.append(place);
  return inner;
}

function dragTo(from: HTMLElement, over: Element | null) {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => over,
  });
  pointer(from, "pointerdown", 10, 10);
  pointer(window, "pointermove", 300, 200);
  pointer(window, "pointerup", 300, 200);
}

describe("dragging a result out of the tree", () => {
  it("reports where it was dropped on the zone, and moves nothing in the tree", () => {
    const drops: Drop[] = [];
    const actions: GroupAction[] = [];
    const view = mount({
      onDrop: (d) => drops.push(d),
      onAction: (a) => actions.push(a),
    });
    dragTo(rowNamed(view, "Counts"), zone());
    expect(drops).toEqual([{ artefactIds: [ids.r(3)], x: 300, y: 200 }]);
    expect(actions).toEqual([]);
  });

  it("takes every chosen result together", () => {
    const drops: Drop[] = [];
    const view = mount({ onDrop: (d) => drops.push(d) });
    for (const name of ["Counts", "Loose figure"]) {
      act(() => {
        rowNamed(view, name).dispatchEvent(
          new MouseEvent("click", { bubbles: true, ctrlKey: true }),
        );
      });
    }
    dragTo(rowNamed(view, "Counts"), zone());
    expect(drops).toHaveLength(1);
    expect(drops[0]?.artefactIds).toHaveLength(2);
  });

  it("shows the drop as allowed while the pointer is over the zone", () => {
    const view = mount({ onDrop: () => undefined });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => zone(),
    });
    pointer(rowNamed(view, "Counts"), "pointerdown", 10, 10);
    pointer(window, "pointermove", 300, 200);
    expect(
      document.body
        .querySelector(".results__ghost")
        ?.classList.contains("results__ghost--no-drop"),
    ).toBe(false);
    pointer(window, "pointerup", 300, 200);
  });

  it("drops nothing outside the zone or tree, and a folder cannot be pinned", () => {
    const drops: Drop[] = [];
    const view = mount({ onDrop: (d) => drops.push(d) });
    dragTo(rowNamed(view, "Counts"), document.body);
    dragTo(rowNamed(view, "Figures"), zone());
    expect(drops).toEqual([]);
  });

  it("still moves an artefact between folders when the drop is on a folder", () => {
    const actions: GroupAction[] = [];
    const drops: Drop[] = [];
    const view = mount({
      onDrop: (d) => drops.push(d),
      onAction: (a) => actions.push(a),
    });
    dragTo(rowNamed(view, "Counts"), rowNamed(view, "Figures"));
    expect(actions).toHaveLength(1);
    expect(drops).toEqual([]);
  });

  it("does not start when the project is read-only", () => {
    const drops: Drop[] = [];
    const view = mount({ onDrop: (d) => drops.push(d), disabled: true });
    dragTo(rowNamed(view, "Counts"), zone());
    expect(drops).toEqual([]);
  });
});

describe("pinning from the menu", () => {
  const openMenu = (view: HTMLElement, name: string) => {
    const row = rowNamed(view, name);
    const button = row.querySelector<HTMLElement>(".results__actions");
    if (button === null) throw new Error("no actions button");
    act(() => button.click());
  };
  const entry = (label: string) =>
    [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
      (item) => item.textContent?.includes(label),
    );

  it("offers Pin to canvas for a result and pins it", () => {
    const onPin = vi.fn();
    const view = mount({ onPin });
    openMenu(view, "Counts");
    const item = entry("Pin to canvas");
    expect(item).toBeDefined();
    act(() => item?.click());
    expect(onPin).toHaveBeenCalledWith([ids.r(3)]);
  });

  it("offers it for several chosen results at once", () => {
    const onPin = vi.fn();
    const view = mount({ onPin });
    for (const name of ["Counts", "Loose figure"]) {
      act(() => {
        rowNamed(view, name).dispatchEvent(
          new MouseEvent("click", { bubbles: true, ctrlKey: true }),
        );
      });
    }
    openMenu(view, "Counts");
    act(() => entry("Pin to canvas")?.click());
    expect(onPin.mock.calls[0]?.[0]).toHaveLength(2);
  });

  it("is not offered where there is no canvas to pin to", () => {
    const view = mount();
    openMenu(view, "Counts");
    expect(entry("Pin to canvas")).toBeUndefined();
  });

  it("is not offered for a folder", () => {
    const view = mount({ onPin: () => undefined });
    openMenu(view, "Figures");
    expect(entry("Pin to canvas")).toBeUndefined();
  });
});

describe("the on-canvas mark", () => {
  it("marks the results already pinned, in words", () => {
    const view = mount({ pinned: new Set([ids.r(3)]) });
    expect(rowNamed(view, "Counts").textContent).toContain("On canvas");
    expect(rowNamed(view, "Loose figure").textContent).not.toContain(
      "On canvas",
    );
  });
});
