import { describe, expect, it } from "vitest";
import { arrangedFrom, loadedExperiment } from "../../test/notebook-support";
import { buildCitedByIndex, citedBy } from "./citedBy";

const KEY = "z:u:7XK2PQ9M";
const OTHER = "z:u:3ABCDEFG";

function location(ref: string) {
  return {
    experimentFolder: ref,
    experimentRef: ref,
    experimentTitle: `Experiment ${ref}`,
  };
}

function lookup(
  sections: Parameters<typeof loadedExperiment>[3][],
  citekey = KEY,
) {
  const arranged = arrangedFrom(
    sections.map((body, i) =>
      loadedExperiment(`EXP-00${i + 1}`, `EXP-00${i + 1}`, "Q1", body),
    ),
  );
  return citedBy(buildCitedByIndex(arranged), citekey);
}

describe("citedBy (FR-CIT-12)", () => {
  it("is empty for a source nothing cites", () => {
    expect(lookup([{ methods: `See [@${OTHER}].` }])).toEqual([]);
  });

  it("lists the one experiment that cites the source", () => {
    expect(lookup([{ methods: `See [@${KEY}].` }])).toEqual([
      location("EXP-001"),
    ]);
  });

  it("lists several experiments in project order", () => {
    expect(
      lookup([
        { methods: `[@${KEY}]` },
        { methods: `[@${OTHER}]` },
        { interpretation: `[@${KEY}, p. 4]` },
      ]),
    ).toEqual([location("EXP-001"), location("EXP-003")]);
  });

  it("gives one entry when Methods and Interpretation both cite it", () => {
    expect(
      lookup([
        { methods: `[@${KEY}]`, interpretation: `[@${KEY}] twice [@${KEY}]` },
      ]),
    ).toEqual([location("EXP-001")]);
  });

  it("finds a source inside a multi-source cluster", () => {
    expect(lookup([{ methods: `[@${OTHER}; @${KEY}]` }])).toEqual([
      location("EXP-001"),
    ]);
  });

  it("finds a hand-written author-in-text citation", () => {
    expect(lookup([{ methods: `As @${KEY} [p. 4] showed.` }])).toEqual([
      location("EXP-001"),
    ]);
  });

  it("ignores Results notes, which are outside the citation context", () => {
    expect(lookup([{ results_notes: `[@${KEY}]` }])).toEqual([]);
  });

  it("ignores a citation inside a code fence or code span", () => {
    expect(
      lookup([
        { methods: "```\n[@" + KEY + "]\n```" },
        { interpretation: "`[@" + KEY + "]`" },
      ]),
    ).toEqual([]);
  });
});
