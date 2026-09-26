import type {
  Arranged,
  ArrangedExperiment,
  LoadedExperiment,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { sampleNotebook } from "../../model/fakeApi";
import { editableExperiment, liveKey, sectionText } from "./liveEditor";

const { state } = sampleNotebook();
const [first, second] = state.experiments;
if (first === undefined || second === undefined) throw new Error("sample");

function withMethods(experiment: LoadedExperiment, body: string) {
  return {
    ...experiment,
    file: {
      ...experiment.file,
      body: {
        ...experiment.file.body,
        sections: experiment.file.body.sections.map((s) =>
          s.key === "methods" ? { ...s, body } : s,
        ),
      },
    },
  };
}

const arranged = (
  inQuestion: ArrangedExperiment[],
  unassigned: ArrangedExperiment[] = [],
): Arranged => {
  const question = state.questions[0];
  if (question === undefined) throw new Error("sample");
  return {
    questions: [{ question, readOnly: false, experiments: inQuestion }],
    unassigned,
    problems: [],
  };
};

const shown = (experiment: LoadedExperiment, readOnly = false) => ({
  experiment,
  readOnly,
  absentFromOrder: false,
});

describe("liveKey", () => {
  it("names one experiment's section, and nothing when no section is live", () => {
    expect(liveKey({ folder: "EXP-001", section: "methods" })).toBe(
      "EXP-001:methods",
    );
    expect(liveKey(null)).toBe("");
  });
});

describe("editableExperiment", () => {
  it("finds an experiment under a question or unassigned, by its folder", () => {
    const view = arranged([shown(first)], [shown(second)]);
    expect(editableExperiment(view, first.folder)?.experiment).toBe(first);
    expect(editableExperiment(view, second.folder)?.experiment).toBe(second);
  });

  it("finds nothing for a folder that is gone, or before the project has loaded", () => {
    expect(editableExperiment(arranged([shown(first)]), "EXP-999")).toBe(
      undefined,
    );
    expect(editableExperiment(null, first.folder)).toBe(undefined);
  });

  it("never offers a read-only experiment for editing (spec P6, AGENTS.md rule 5)", () => {
    expect(
      editableExperiment(arranged([shown(first, true)]), first.folder),
    ).toBe(undefined);
  });
});

describe("sectionText", () => {
  it("reads a section's stored text, and an empty string for a missing one", () => {
    expect(sectionText(withMethods(first, "PCA on counts."), "methods")).toBe(
      "PCA on counts.",
    );
    const noSections = {
      ...first,
      file: { ...first.file, body: { ...first.file.body, sections: [] } },
    };
    expect(sectionText(noSections, "interpretation")).toBe("");
  });
});
