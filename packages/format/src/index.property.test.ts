import fc from "fast-check";
import { describe, expect, it } from "vitest";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

describe("format package placeholder property", () => {
  it("reversing a string twice is the identity", () => {
    fc.assert(
      fc.property(fc.string(), (value) => {
        const once = value.split("").reverse().join("");
        const twice = once.split("").reverse().join("");
        expect(twice).toBe(value);
      }),
      { numRuns },
    );
  });
});
