import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { appendCitation, citesCitekey, removeCitekey } from "./citationEdit";
import { citationClusters } from "./citationContext";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);
const KEYS = ["z:u:AAAA2222", "z:u:BBBB3333", "z:u:CCCC4444"];

const piece = fc.oneof(
  fc.constantFrom(" ", "plain words ", ". ", "\n\n", "`code` "),
  fc.constantFrom(...KEYS).map((k) => `[@${k}]`),
  fc.constantFrom(...KEYS).map((k) => `[see @${k}, p. 3; -@${KEYS[0]}]`),
  fc.constantFrom(...KEYS).map((k) => `@${k} [p. 4] `),
  fc.constantFrom(...KEYS).map((k) => `\`[@${k}]\` `),
  fc.constantFrom(...KEYS).map((k) => `\n\`\`\`\n[@${k}]\n\`\`\`\n`),
);
const text = fc.array(piece, { maxLength: 12 }).map((p) => p.join(""));
const key = fc.constantFrom(...KEYS);

const items = (s: string) => citationClusters(s).flatMap((c) => c.items);

describe("citation attach and detach properties", () => {
  it("removeCitekey leaves no citation of the key and every other one", () => {
    fc.assert(
      fc.property(text, key, (input, k) => {
        const out = removeCitekey(input, k);
        expect(citesCitekey(out, k)).toBe(false);
        expect(items(out).map((i) => i.citekey)).toEqual(
          items(input)
            .map((i) => i.citekey)
            .filter((c) => c !== k),
        );
      }),
      { numRuns },
    );
  });

  it("removeCitekey is idempotent", () => {
    fc.assert(
      fc.property(text, key, (input, k) => {
        const once = removeCitekey(input, k);
        expect(removeCitekey(once, k)).toBe(once);
      }),
      { numRuns },
    );
  });

  it("appendCitation cites the key, keeps every earlier citation and is idempotent", () => {
    fc.assert(
      fc.property(text, key, (input, k) => {
        const out = appendCitation(input, k);
        expect(citesCitekey(out, k)).toBe(true);
        expect(appendCitation(out, k)).toBe(out);
        const before = items(input).map((i) => i.citekey);
        expect(
          items(out)
            .map((i) => i.citekey)
            .slice(0, before.length),
        ).toEqual(before);
      }),
      { numRuns },
    );
  });
});
