import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { AUTHOR_DATE_STYLE, EN_US_LOCALE, NUMERIC_STYLE } from "./bundled";
import {
  renderLiterature,
  type CitationCluster,
  type LiteratureSource,
} from "./literature";

/** S5-G01: random citation edits keep Literature equal to the cited sources, numbered by first appearance, one entry per source. */

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

const LETTERS = ["A", "B", "C", "D", "E", "F", "G", "H"] as const;
const KEYS = LETTERS.map((letter) =>
  `z:u:KEY${letter}2222`.replace("KEY", "ZZZ"),
);
const ITEMS: LiteratureSource[] = LETTERS.map((letter, index) => ({
  id: KEYS[index] ?? "",
  type: "article-journal",
  title: `Paper-${letter}`,
  author: [{ family: `Author${letter}`, given: "Sam" }],
  issued: { "date-parts": [[2000 + index]] },
}));

const cluster = (keys: readonly string[]): CitationCluster => ({
  items: keys.map((citekey) => ({
    prefix: "",
    suppressAuthor: false,
    citekey,
    suffix: "",
  })),
});

type Edit =
  | { kind: "insert"; at: number; keys: string[] }
  | { kind: "delete"; at: number }
  | { kind: "move"; from: number; to: number }
  | { kind: "repeat"; at: number };

const keyArb = fc.constantFrom(...KEYS);
const editArb: fc.Arbitrary<Edit> = fc.oneof(
  fc.record({
    kind: fc.constant("insert" as const),
    at: fc.nat(40),
    keys: fc.array(keyArb, { minLength: 1, maxLength: 3 }),
  }),
  fc.record({ kind: fc.constant("delete" as const), at: fc.nat(40) }),
  fc.record({
    kind: fc.constant("move" as const),
    from: fc.nat(40),
    to: fc.nat(40),
  }),
  fc.record({ kind: fc.constant("repeat" as const), at: fc.nat(40) }),
);

function apply(list: CitationCluster[], edit: Edit): CitationCluster[] {
  const next = [...list];
  const clamp = (n: number, max: number) => (max === 0 ? 0 : n % (max + 1));
  switch (edit.kind) {
    case "insert":
      next.splice(clamp(edit.at, next.length), 0, cluster(edit.keys));
      return next;
    case "delete":
      if (next.length > 0) next.splice(edit.at % next.length, 1);
      return next;
    case "move": {
      if (next.length === 0) return next;
      const [moved] = next.splice(edit.from % next.length, 1);
      if (moved !== undefined)
        next.splice(clamp(edit.to, next.length), 0, moved);
      return next;
    }
    case "repeat": {
      const source = next[edit.at % Math.max(next.length, 1)];
      if (source !== undefined) next.push(source);
      return next;
    }
  }
}

function firstAppearance(list: readonly CitationCluster[]): string[] {
  const seen: string[] = [];
  for (const { items } of list) {
    for (const { citekey } of items) {
      if (!seen.includes(citekey)) seen.push(citekey);
    }
  }
  return seen;
}

const letterOf = (key: string) => LETTERS[KEYS.indexOf(key)] ?? "?";

function render(list: CitationCluster[], styleXml: string) {
  const result = renderLiterature({
    clusters: list,
    items: ITEMS,
    styleXml,
    localeXml: EN_US_LOCALE,
  });
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("Literature consistency under random citation edits (S5-G01)", () => {
  it("numbered style: one entry per cited source, numbered by first appearance", () => {
    fc.assert(
      fc.property(fc.array(editArb, { maxLength: 14 }), (edits) => {
        let list: CitationCluster[] = [];
        for (const edit of edits) {
          list = apply(list, edit);
          const expected = firstAppearance(list);
          const { entries } = render(list, NUMERIC_STYLE);
          expect(entries).toHaveLength(expected.length);
          expected.forEach((key, index) => {
            const entry = entries[index] ?? "";
            expect(entry.startsWith(`${index + 1}. `)).toBe(true);
            expect(entry).toContain(`Paper-${letterOf(key)}.`);
          });
        }
      }),
      { numRuns },
    );
  });

  it("author-date style: exactly the cited sources, each once", () => {
    fc.assert(
      fc.property(fc.array(editArb, { maxLength: 14 }), (edits) => {
        const list = edits.reduce(apply, [] as CitationCluster[]);
        const expected = new Set(firstAppearance(list).map(letterOf));
        const { text } = render(list, AUTHOR_DATE_STYLE);
        for (const letter of LETTERS) {
          const count =
            text.match(new RegExp(String.raw`Paper-${letter}\b`, "g"))
              ?.length ?? 0;
          expect(count).toBe(expected.has(letter) ? 1 : 0);
        }
      }),
      { numRuns },
    );
  });

  it("is a function of the citations alone: the same list always renders the same text", () => {
    fc.assert(
      fc.property(fc.array(editArb, { maxLength: 14 }), (edits) => {
        const list = edits.reduce(apply, [] as CitationCluster[]);
        expect(render(list, NUMERIC_STYLE).text).toBe(
          render([...list], NUMERIC_STYLE).text,
        );
      }),
      { numRuns },
    );
  });
});
