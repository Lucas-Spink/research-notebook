import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { arrangedFrom, loadedExperiment } from "../../test/notebook-support";
import { buildCitedByIndex, citedBy } from "./citedBy";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);
const KEYS = ["z:u:AAAA2222", "z:u:BBBB3333", "z:u:CCCC4444"];

/** A piece of section text and the citekeys it really cites, known by construction so the oracle needs no parser. */
type Piece = { text: string; cites: readonly string[] };

const key = fc.constantFrom(...KEYS);
const piece: fc.Arbitrary<Piece> = fc.oneof(
  fc
    .constantFrom(" ", "plain words ", ". ", "\n\n")
    .map((text) => ({ text, cites: [] })),
  key.map((k) => ({ text: `[@${k}]`, cites: [k] })),
  key.map((k) => ({
    text: `[see @${k}, p. 3; @${KEYS[0]}]`,
    cites: [k, KEYS[0] ?? k],
  })),
  key.map((k) => ({ text: `@${k} [p. 4] `, cites: [k] })),
  key.map((k) => ({ text: `\`[@${k}]\` `, cites: [] })),
  key.map((k) => ({ text: `\n\`\`\`\n[@${k}]\n\`\`\`\n`, cites: [] })),
);
const section = fc.array(piece, { maxLength: 8 });
const experiment = fc.record({
  methods: section,
  interpretation: section,
  results_notes: section,
});

const join = (pieces: readonly Piece[]) => pieces.map((p) => p.text).join("");

describe("cited-by lookup property (FR-CIT-12)", () => {
  it("equals an independent scan of the citation contexts, one entry per experiment", () => {
    fc.assert(
      fc.property(fc.array(experiment, { maxLength: 6 }), (generated) => {
        const arranged = arrangedFrom(
          generated.map((sections, i) =>
            loadedExperiment(`EXP-00${i}`, `EXP-00${i}`, "Q1", {
              methods: join(sections.methods),
              interpretation: join(sections.interpretation),
              results_notes: join(sections.results_notes),
            }),
          ),
        );
        const index = buildCitedByIndex(arranged);
        for (const k of KEYS) {
          const expected = generated.flatMap((sections, i) =>
            [...sections.methods, ...sections.interpretation].some((p) =>
              p.cites.includes(k),
            )
              ? [`EXP-00${i}`]
              : [],
          );
          expect(citedBy(index, k).map((l) => l.experimentFolder)).toEqual(
            expected,
          );
        }
      }),
      { numRuns },
    );
  });
});
