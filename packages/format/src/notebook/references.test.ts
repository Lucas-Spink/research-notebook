import { describe, expect, it } from "vitest";
import { arrangedFrom, loadedExperiment } from "../../test/notebook-support";
import { buildReferenceIndex, referencedIn } from "./references";

const A1 = "01JB0000000000000000000001";
const A2 = "01JB0000000000000000000002";
const NEVER_REFERENCED = "01JB0000000000000000000009";

function refLink(ulid: string): string {
  return `[Volcano plot](evidence/v.dat "art:${ulid}")`;
}

describe("referencedIn", () => {
  it("is empty for an artefact nothing references", () => {
    const arranged = arrangedFrom([
      loadedExperiment("EXP-001", "EXP-001", "Q1", {
        methods: refLink(A1),
      }),
    ]);
    expect(
      referencedIn(buildReferenceIndex(arranged), NEVER_REFERENCED),
    ).toEqual([]);
  });

  it("reports the experiment and section of a single reference", () => {
    const arranged = arrangedFrom([
      loadedExperiment("EXP-001", "EXP-001", "Q1", {
        methods: `Some prose. ${refLink(A1)}`,
      }),
    ]);
    expect(referencedIn(buildReferenceIndex(arranged), A1)).toEqual([
      {
        experimentFolder: "EXP-001",
        experimentRef: "EXP-001",
        experimentTitle: "Experiment EXP-001",
        section: "methods",
      },
    ]);
  });

  it("lists every reference across experiments and sections, keyed by artefact", () => {
    const arranged = arrangedFrom([
      loadedExperiment("EXP-001", "EXP-001", "Q1", {
        methods: refLink(A1),
        results_notes: `${refLink(A1)} and ${refLink(A2)}`,
      }),
      loadedExperiment("EXP-002", "EXP-002", "Q1", {
        interpretation: refLink(A1),
      }),
    ]);
    const index = buildReferenceIndex(arranged);
    expect(referencedIn(index, A1)).toEqual([
      {
        experimentFolder: "EXP-001",
        experimentRef: "EXP-001",
        experimentTitle: "Experiment EXP-001",
        section: "methods",
      },
      {
        experimentFolder: "EXP-001",
        experimentRef: "EXP-001",
        experimentTitle: "Experiment EXP-001",
        section: "results_notes",
      },
      {
        experimentFolder: "EXP-002",
        experimentRef: "EXP-002",
        experimentTitle: "Experiment EXP-002",
        section: "interpretation",
      },
    ]);
    expect(referencedIn(index, A2)).toEqual([
      {
        experimentFolder: "EXP-001",
        experimentRef: "EXP-001",
        experimentTitle: "Experiment EXP-001",
        section: "results_notes",
      },
    ]);
  });

  it("leaves out a reference inside an unrecognised section", () => {
    const experiment = loadedExperiment("EXP-001", "EXP-001", "Q1");
    experiment.file.body.sections = [
      { key: "unknown", heading: "Notes", body: refLink(A1) },
    ];
    const arranged = arrangedFrom([experiment]);
    expect(referencedIn(buildReferenceIndex(arranged), A1)).toEqual([]);
  });

  it("leaves out reference syntax written inside a code fence (one parser, AGENTS.md rule 2)", () => {
    const fenced = ["```", refLink(A1), "```"].join("\n");
    const arranged = arrangedFrom([
      loadedExperiment("EXP-001", "EXP-001", "Q1", { methods: fenced }),
    ]);
    expect(referencedIn(buildReferenceIndex(arranged), A1)).toEqual([]);
  });
});
