import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { withPinned } from "./pinned";

/**
 * The row being edited stays rendered while scrolled out of view
 * (ADR-0043 point 4), so virtualisation never unmounts its editor.
 */
describe("withPinned", () => {
  it("leaves the rows in view as they are when nothing is pinned", () => {
    expect(withPinned([3, 4, 5], null)).toEqual([3, 4, 5]);
  });

  it("leaves them as they are when the pinned row is already in view", () => {
    expect(withPinned([3, 4, 5], 4)).toEqual([3, 4, 5]);
  });

  it("adds a pinned row above or below the rows in view, in order", () => {
    expect(withPinned([10, 11, 12], 2)).toEqual([2, 10, 11, 12]);
    expect(withPinned([10, 11, 12], 40)).toEqual([10, 11, 12, 40]);
  });

  it("always returns every row in view plus the pinned one, sorted and without repeats", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 60 }),
        fc.option(fc.integer({ min: 0, max: 500 }), { nil: null }),
        (start, length, pinned) => {
          const inView = Array.from({ length }, (_, i) => start + i);
          const result = withPinned(inView, pinned);
          const expected = new Set(
            pinned === null ? inView : [...inView, pinned],
          );
          expect(result).toEqual([...expected].sort((a, b) => a - b));
        },
      ),
    );
  });
});
