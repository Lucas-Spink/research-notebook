import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { summariseMarkdown } from "../index";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

describe("summariseMarkdown properties", () => {
  it("never throws, and always gives one trimmed line within the bound", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "binary", maxLength: 400 }),
        fc.integer({ min: 1, max: 80 }),
        (text, max) => {
          const summary = summariseMarkdown(text, max);
          expect([...summary].length).toBeLessThanOrEqual(max);
          expect(summary).not.toMatch(/[\n\r\t]/);
          expect(summary).toBe(summary.trim());
        },
      ),
      { numRuns },
    );
  });

  it("gives plain words back as they are, one space apart", () => {
    const word = fc.stringMatching(/^[A-Za-z0-9]{1,8}$/);
    fc.assert(
      fc.property(fc.array(word, { minLength: 1, maxLength: 20 }), (words) => {
        const written = words.join(" \n ");
        expect(summariseMarkdown(written, 1000)).toBe(words.join(" "));
      }),
      { numRuns },
    );
  });

  it("shows the label of any link whatever the target holds", () => {
    const label = fc.stringMatching(/^[A-Za-z0-9]{1,10}$/);
    const target = fc.stringMatching(/^[A-Za-z0-9/._:-]{0,20}$/);
    fc.assert(
      fc.property(label, target, (l, t) => {
        expect(summariseMarkdown(`[${l}](${t})`, 100)).toBe(l);
      }),
      { numRuns },
    );
  });
});
