import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { summariseMarkdown, summariseMarkdownParts } from "../index";

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

describe("summariseMarkdownParts properties", () => {
  it("never throws, and the visible text stays within the bound", () => {
    fc.assert(
      fc.property(
        fc.string({ unit: "binary", maxLength: 400 }),
        fc.integer({ min: 1, max: 80 }),
        (text, max) => {
          const parts = summariseMarkdownParts(text, max);
          const visible = parts
            .map((p) => (p.kind === "ref" ? p.label : p.text))
            .join("");
          expect([...visible].length).toBeLessThanOrEqual(max);
        },
      ),
      { numRuns },
    );
  });

  it("keeps a generated reference's label, ULID and version through the summary", () => {
    const label = fc.stringMatching(/^[A-Za-z0-9]{1,10}$/);
    // Crockford Base32 excludes I, L, O and U (same pattern as the `Ulid` schema).
    const ulid = fc.stringMatching(/^[0-7][0-9A-HJKMNP-TV-Z]{25}$/);
    const version = fc.option(fc.integer({ min: 1, max: 99 }), { nil: null });
    fc.assert(
      fc.property(label, ulid, version, (l, u, v) => {
        const titleBody = v === null ? u : `${u} v${v}`;
        const markdown = `[${l}](x.pdf "art:${titleBody}")`;
        expect(summariseMarkdownParts(markdown, 1000)).toEqual([
          { kind: "ref", label: l, ulid: u, version: v },
        ]);
      }),
      { numRuns },
    );
  });
});
