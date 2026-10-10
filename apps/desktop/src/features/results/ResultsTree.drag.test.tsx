import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { GroupAction } from "./model/actions";
import { ids, sampleArtefacts } from "./model/sample";
import { ResultsTree } from "./ResultsTree";

/**
 * Rows are dragged by pointer: the desktop window handles drag and drop for
 * files dropped from outside, which switches the page's own drag events off
 * on Windows, so these gestures must not depend on them.
 */

let root: Root | null = null;
let container: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  Reflect.deleteProperty(document, "elementFromPoint");
});

function mount(onAction: (action: GroupAction) => void, disabled = false) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ResultsTree
        file={sampleArtefacts()}
        disabled={disabled}
        onAction={(action) => {
          onAction(action);
          return Promise.resolve({ ok: true });
        }}
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

/** Presses on `from`, moves over `over`, and releases there. */
function drag(from: HTMLElement, over: HTMLElement | null) {
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => over,
  });
  pointer(from, "pointerdown", 10, 10);
  pointer(window, "pointermove", 40, 40);
  pointer(window, "pointerup", 40, 40);
}

describe("dragging rows by pointer", () => {
  it("drops an artefact on a folder and moves it there", () => {
    const actions: GroupAction[] = [];
    const view = mount((a) => actions.push(a));
    drag(rowNamed(view, "Counts"), rowNamed(view, "Figures"));
    expect(actions).toEqual([
      {
        kind: "moveToGroup",
        artefactId: ids.r(3),
        from: ids.g(2),
        to: ids.g(1),
      },
    ]);
  });

  it("shows the label that follows the pointer, and the folder it will drop into, while dragging", () => {
    const view = mount(() => undefined);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => rowNamed(view, "Figures"),
    });
    pointer(rowNamed(view, "Counts"), "pointerdown", 10, 10);
    pointer(window, "pointermove", 40, 40);
    expect(document.body.querySelector(".results__ghost")?.textContent).toBe(
      "Counts",
    );
    expect(
      rowNamed(view, "Figures").classList.contains("results__row--over"),
    ).toBe(true);
    pointer(window, "pointerup", 40, 40);
    expect(document.body.querySelector(".results__ghost")).toBeNull();
  });

  it("does nothing for a press that does not travel, so a click still works", () => {
    const actions: GroupAction[] = [];
    const view = mount((a) => actions.push(a));
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => rowNamed(view, "Figures"),
    });
    pointer(rowNamed(view, "Counts"), "pointerdown", 10, 10);
    pointer(window, "pointermove", 12, 11);
    pointer(window, "pointerup", 12, 11);
    expect(actions).toEqual([]);
  });

  it("cancels with Escape and drops nothing", () => {
    const actions: GroupAction[] = [];
    const view = mount((a) => actions.push(a));
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => rowNamed(view, "Figures"),
    });
    pointer(rowNamed(view, "Counts"), "pointerdown", 10, 10);
    pointer(window, "pointermove", 40, 40);
    act(() => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    pointer(window, "pointerup", 40, 40);
    expect(actions).toEqual([]);
    expect(document.body.querySelector(".results__ghost")).toBeNull();
  });

  it("drops nothing on a place that cannot take it, such as itself or empty space", () => {
    const actions: GroupAction[] = [];
    const view = mount((a) => actions.push(a));
    drag(rowNamed(view, "Figures"), rowNamed(view, "Figures"));
    drag(rowNamed(view, "Counts"), null);
    expect(actions).toEqual([]);
  });

  it("does not start a drag when the project is read-only", () => {
    const actions: GroupAction[] = [];
    const view = mount((a) => actions.push(a), true);
    drag(rowNamed(view, "Counts"), rowNamed(view, "Figures"));
    expect(actions).toEqual([]);
  });
});
