import { describe, expect, it } from "vitest";
import {
  CENTRE_MIN,
  LEFT_LIMITS,
  RIGHT_LIMITS,
  clampWidth,
  initialLayout,
  layoutReducer,
  visibleWidths,
  type LayoutAction,
  type LayoutState,
} from "./layout";

const run = (actions: LayoutAction[], from: LayoutState = initialLayout) =>
  actions.reduce(layoutReducer, from);

describe("clampWidth", () => {
  it("keeps a width within its limits", () => {
    expect(clampWidth(10, LEFT_LIMITS)).toBe(LEFT_LIMITS.min);
    expect(clampWidth(9999, LEFT_LIMITS)).toBe(LEFT_LIMITS.max);
    expect(clampWidth(300, LEFT_LIMITS)).toBe(300);
  });

  it("rounds to a whole pixel and treats a non-number as the default", () => {
    expect(clampWidth(300.6, LEFT_LIMITS)).toBe(301);
    expect(clampWidth(Number.NaN, LEFT_LIMITS)).toBe(LEFT_LIMITS.initial);
  });
});

describe("layoutReducer", () => {
  it("starts with both panels open at their default widths", () => {
    expect(initialLayout).toEqual({
      left: LEFT_LIMITS.initial,
      right: RIGHT_LIMITS.initial,
      leftCollapsed: false,
      rightCollapsed: false,
    });
  });

  it("resizes a panel within its limits", () => {
    expect(run([{ type: "resize", side: "left", width: 320 }]).left).toBe(320);
    expect(run([{ type: "resize", side: "right", width: 1 }]).right).toBe(
      RIGHT_LIMITS.min,
    );
  });

  it("resizes by a step, in either direction", () => {
    const grown = run([{ type: "nudge", side: "left", delta: 16 }]);
    expect(grown.left).toBe(LEFT_LIMITS.initial + 16);
    expect(run([{ type: "nudge", side: "left", delta: -16 }], grown).left).toBe(
      LEFT_LIMITS.initial,
    );
  });

  it("collapses and restores a panel, remembering its width", () => {
    const wide = run([{ type: "resize", side: "right", width: 500 }]);
    const closed = run([{ type: "toggle", side: "right" }], wide);
    expect(closed.rightCollapsed).toBe(true);
    expect(closed.right).toBe(500);
    expect(run([{ type: "toggle", side: "right" }], closed)).toEqual(wide);
  });

  it("opens a collapsed panel when it is resized", () => {
    const closed = run([{ type: "toggle", side: "left" }]);
    expect(
      run([{ type: "resize", side: "left", width: 300 }], closed).leftCollapsed,
    ).toBe(false);
  });

  it("does not change its input", () => {
    const before = { ...initialLayout };
    run([{ type: "toggle", side: "left" }]);
    expect(initialLayout).toEqual(before);
  });
});

describe("visibleWidths", () => {
  it("is the stored widths when there is room", () => {
    expect(visibleWidths(initialLayout, 2000)).toEqual({
      left: initialLayout.left,
      right: initialLayout.right,
    });
  });

  it("is nothing for a collapsed panel", () => {
    const state = run([
      { type: "toggle", side: "left" },
      { type: "toggle", side: "right" },
    ]);
    expect(visibleWidths(state, 2000)).toEqual({ left: 0, right: 0 });
  });

  it("always leaves the canvas its minimum, narrowing the right panel first", () => {
    const widths = visibleWidths(initialLayout, 700);
    expect(widths.left + widths.right + CENTRE_MIN).toBeLessThanOrEqual(700);
    expect(widths.left).toBe(initialLayout.left);
    expect(widths.right).toBeGreaterThanOrEqual(0);
  });

  it("narrows the left panel too when the right is already gone", () => {
    const widths = visibleWidths(initialLayout, CENTRE_MIN + 100);
    expect(widths.right).toBe(0);
    expect(widths.left).toBe(100);
  });

  it("never returns a negative width", () => {
    expect(visibleWidths(initialLayout, 0)).toEqual({ left: 0, right: 0 });
  });
});
