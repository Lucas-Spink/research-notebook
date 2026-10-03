import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { citationClusters } from "./citationContext";
import { replaceCitekey } from "./citekeyRewrite";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);
const KEYS = ["z:u:AAAA2222", "z:u:BBBB3333", "z:u:CCCC4444", "z:g12:DDDD5555"];

const piece = fc.oneof(
  fc.constantFrom(" ", "plain words ", ". ", "\n\n", "`code` "),
  fc.constantFrom(...KEYS).map((k) => `[@${k}]`),
  fc.constantFrom(...KEYS).map((k) => `[see @${k}, p. 3; -@${KEYS[0]}]`),
  fc.constantFrom(...KEYS).map((k) => `@${k} [p. 4] `),
  fc.constantFrom(...KEYS).map((k) => `\`[@${k}]\` `),
  fc.constantFrom(...KEYS).map((k) => `\n\`\`\`\n[@${k}]\n\`\`\`\n`),
);
const text = fc.array(piece, { maxLength: 12 }).map((p) => p.join(""));
const pair = fc.tuple(fc.constantFrom(...KEYS), fc.constantFrom(...KEYS));

describe("replaceCitekey properties (FR-CIT-08)", () => {
  it("changes exactly the citekeys the parser sees and nothing else", () => {
    fc.assert(
      fc.property(text, pair, (input, [from, to]) => {
        const items = (s: string) =>
          citationClusters(s).flatMap((c) => c.items);
        const expected = items(input).map((i) =>
          i.citekey === from ? { ...i, citekey: to } : i,
        );
        expect(items(replaceCitekey(input, from, to))).toEqual(expected);
      }),
      { numRuns },
    );
  });

  it("is idempotent and reversible when the target is unused", () => {
    fc.assert(
      fc.property(text, (input) => {
        const once = replaceCitekey(input, KEYS[0] ?? "", "z:u:ZZZZ9999");
        expect(replaceCitekey(once, KEYS[0] ?? "", "z:u:ZZZZ9999")).toBe(once);
        expect(replaceCitekey(once, "z:u:ZZZZ9999", KEYS[0] ?? "")).toBe(input);
      }),
      { numRuns },
    );
  });
});
