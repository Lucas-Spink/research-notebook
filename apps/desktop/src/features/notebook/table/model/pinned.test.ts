import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { withPinned } from "./pinned";

/**
 * The row being edited, and the row holding keyboard focus, stay rendered
 * while scrolled out of view (ADR-0043 points 4 and 5), so virtualisation
 * never unmounts an editor or the grid's one tab stop.
 */
describe("withPinned", () => {
  it("leaves the rows in view as they are when nothing is pinned", () => {
    expect(withPinned([3, 4, 5], [])).toEqual([3, 4, 5]);
  });

  it("leaves them as they are when the pinned rows are already in view", () => {
    expect(withPinned([3, 4, 5], [4, 5])).toEqual([3, 4, 5]);
  });

  it("adds pinned rows above or below the rows in view, in order", () => {
    expect(withPinned([10, 11, 12], [2])).toEqual([2, 10, 11, 12]);
    expect(withPinned([10, 11, 12], [40])).toEqual([10, 11, 12, 40]);
    expect(withPinned([10, 11, 12], [40, 2])).toEqual([2, 10, 11, 12, 40]);
  });

  it("adds a row pinned twice only once", () => {
    expect(withPinned([10, 11], [3, 3])).toEqual([3, 10, 11]);
  });

  it("always returns every row in view plus the pinned ones, sorted and without repeats", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400 }),
        fc.integer({ min: 0, max: 60 }),
        fc.array(fc.integer({ min: 0, max: 500 }), { maxLength: 3 }),
        (start, length, pinned) => {
          const inView = Array.from({ length }, (_, i) => start + i);
          const result = withPinned(inView, pinned);
          const expected = new Set([...inView, ...pinned]);
          expect(result).toEqual([...expected].sort((a, b) => a - b));
        },
      ),
    );
  });
});
