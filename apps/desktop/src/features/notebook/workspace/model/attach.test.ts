import {
  setExperimentSection,
  type ExperimentBodyModel,
  type RecognisedSectionKey,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { sampleNotebook } from "../../model/fakeApi";
import { attachEdits, attachedCitekeys, detachEdits } from "./attach";

const A = "z:u:AAAA2222";
const B = "z:u:BBBB3333";

const base = sampleNotebook().state.experiments[0]?.file.body;

/** The sample experiment's body with the given sections' text set. */
function body(sections: Record<string, string>): ExperimentBodyModel {
  if (base === undefined) throw new Error("no sample experiment");
  return Object.entries(sections).reduce((current, [key, text]) => {
    const next = setExperimentSection(
      current,
      key as RecognisedSectionKey,
      text,
    );
    if (!next.ok) throw new Error(`cannot set ${key}`);
    return next.value;
  }, base);
}

describe("attachedCitekeys", () => {
  it("lists what Methods, Results notes and Interpretation cite", () => {
    const cited = attachedCitekeys(
      body({
        methods: `Done [@${A}].`,
        results_notes: "",
        interpretation: `As @${B} said.`,
      }),
    );
    expect([...cited].sort()).toEqual([A, B]);
  });
});

describe("attachEdits", () => {
  it("appends the citation to Methods", () => {
    expect(attachEdits(body({ methods: "Steps." }), A)).toEqual([
      { key: "methods", text: `Steps.\n\n[@${A}]` },
    ]);
  });

  it("does nothing when a section already cites the source", () => {
    expect(attachEdits(body({ interpretation: `[@${A}]` }), A)).toEqual([]);
  });
});

describe("detachEdits", () => {
  it("edits every section that cites the source and no other", () => {
    const edits = detachEdits(
      body({
        methods: `One [@${A}] and [@${B}].`,
        results_notes: "None.",
        interpretation: `Two [@${A}].`,
      }),
      A,
    );
    expect(edits).toEqual([
      { key: "methods", text: `One and [@${B}].` },
      { key: "interpretation", text: "Two." },
    ]);
  });

  it("does nothing for a source that is not cited", () => {
    expect(detachEdits(body({ methods: "Plain." }), A)).toEqual([]);
  });
});
