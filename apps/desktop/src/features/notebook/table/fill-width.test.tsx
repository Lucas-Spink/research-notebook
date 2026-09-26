import { act } from "react";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { columnLabel, resizeLabel } from "../messages";
import { sampleNotebook } from "../model/fakeApi";
import { columnLayout, gridColumns, gridWidth } from "./model/columns";
import {
  mountNotebook,
  prepareInteractiveTable,
  tableOf,
} from "./tableTesting";

/**
 * FR-TBL-12 (ADR-0043 point 8): section columns share the window's spare
 * width, so the table fills it; the widths stored in project.yaml stay the
 * minimums the resize handles read and change.
 */

const { state } = sampleNotebook();
const stored = gridColumns(columnLayout(state.project.table));
// Wider than the stored columns, so there is spare width to share.
const WINDOW = 2400;

prepareInteractiveTable();

// jsdom has no ResizeObserver; this one reports each element once, as a
// real observer does when observing starts.
const hadObserver = "ResizeObserver" in globalThis;
const original: unknown = Reflect.get(globalThis, "ResizeObserver");
class ReportOnce {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe(target: Element) {
    const entry: ResizeObserverEntry = {
      target,
      contentRect: new DOMRect(),
      borderBoxSize: [],
      contentBoxSize: [],
      devicePixelContentBoxSize: [],
    };
    this.callback([entry], this);
  }
  unobserve() {}
  disconnect() {}
}

function grid(view: HTMLElement): HTMLElement {
  const found = tableOf(view).querySelector('[role="grid"]');
  if (!(found instanceof HTMLElement)) throw new Error("no grid");
  return found;
}

function heading(view: HTMLElement, key: "methods" | "results"): HTMLElement {
  const found = [
    ...tableOf(view).querySelectorAll('[role="columnheader"]'),
  ].find((h) => h.textContent?.startsWith(columnLabel(key)));
  if (!(found instanceof HTMLElement)) throw new Error(`no ${key} heading`);
  return found;
}

describe("columns fill the window (FR-TBL-12)", () => {
  it("draws the stored widths until the window has been measured", () => {
    const { view } = mountNotebook(state);
    expect(grid(view).style.width).toBe(`${gridWidth(stored)}px`);
  });

  describe("once the window is measured", () => {
    beforeAll(() => {
      Object.defineProperty(globalThis, "ResizeObserver", {
        configurable: true,
        writable: true,
        value: ReportOnce,
      });
      // The table's scroll area, without scrollbars, as the observer reads it.
      Object.defineProperty(HTMLElement.prototype, "clientWidth", {
        configurable: true,
        get(this: HTMLElement) {
          return this.classList.contains("wtable") ? WINDOW : 0;
        },
      });
    });
    afterAll(() => {
      if (hadObserver) Reflect.set(globalThis, "ResizeObserver", original);
      else Reflect.deleteProperty(globalThis, "ResizeObserver");
      Reflect.deleteProperty(HTMLElement.prototype, "clientWidth");
    });

    it("makes the grid exactly as wide as the window", async () => {
      const { view } = mountNotebook(state);
      await act(() => Promise.resolve());
      expect(gridWidth(stored)).toBeLessThan(WINDOW);
      expect(grid(view).style.width).toBe(`${WINDOW}px`);
    });

    it("widens section columns but not Results", async () => {
      const { view } = mountNotebook(state);
      await act(() => Promise.resolve());
      const methods = stored.find((c) => c.key === "methods");
      const results = stored.find((c) => c.key === "results");
      expect(
        parseInt(heading(view, "methods").style.width, 10),
      ).toBeGreaterThan(methods?.width ?? 0);
      expect(heading(view, "results").style.width).toBe(`${results?.width}px`);
    });

    it("keeps the stored width as what a resize handle reads and changes", async () => {
      const { view } = mountNotebook(state);
      await act(() => Promise.resolve());
      const methods = stored.find((c) => c.key === "methods");
      const handle = tableOf(view).querySelector(
        `[role="separator"][aria-label="${resizeLabel(columnLabel("methods"))}"]`,
      );
      expect(handle?.getAttribute("aria-valuenow")).toBe(`${methods?.width}`);
    });
  });
});
