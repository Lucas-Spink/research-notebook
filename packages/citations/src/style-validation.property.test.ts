import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { styleFileName, validateStyle } from "./index";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

describe("style validation properties", () => {
  it("never throws, whatever text it is given", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (text) => {
        expect(() => validateStyle(text)).not.toThrow();
      }),
      { numRuns },
    );
  });

  it("styleFileName is always a safe, idempotent .csl name", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 120 }), (input) => {
        const name = styleFileName(input);
        expect(name).toMatch(/^[a-z0-9][a-z0-9-]*\.csl$/);
        expect(name.length).toBeLessThanOrEqual(64);
        expect(styleFileName(name)).toBe(name);
      }),
      { numRuns },
    );
  });
});
