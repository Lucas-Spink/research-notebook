import { describe, expect, it } from "vitest";
import { at, emptyState, must, testEnv } from "../../test/notebook-support";
import {
  createExperiment,
  createQuestion,
  formatRef,
  nextRefNumber,
  refNumber,
  removeExperiment,
  type NotebookState,
} from "../index";

/** FR-EXP-01, FR-EXP-03: refs are allocated from the highest known number and never reused. */

describe("refNumber and formatRef", () => {
  it("reads the number of a ref and nothing else", () => {
    expect(refNumber("Q-003")).toBe(3);
    expect(refNumber("EXP-042")).toBe(42);
    expect(refNumber("EXP-1000")).toBe(1000);
    // Not valid refs, but a folder may be named like this and still occupies the number.
    expect(refNumber("EXP-0042")).toBe(42);
    for (const text of ["", "EXP-", "exp-001", "Q001", "EXP-1a", "Q-001.md"]) {
      expect(refNumber(text), text).toBeNull();
    }
  });

  it("writes at least three digits and no leading zeros beyond three", () => {
    expect(formatRef("Q", 1)).toBe("Q-001");
    expect(formatRef("EXP", 42)).toBe("EXP-042");
    expect(formatRef("EXP", 999)).toBe("EXP-999");
    expect(formatRef("EXP", 1000)).toBe("EXP-1000");
  });
});

describe("nextRefNumber", () => {
  it("starts at the number in project.yaml", () => {
    expect(nextRefNumber("question", emptyState())).toBe(1);
    const state: NotebookState = {
      ...emptyState(),
      project: {
        ...emptyState().project,
        numbering: { next_question: 4, next_experiment: 43 },
      },
    };
    expect(nextRefNumber("question", state)).toBe(4);
    expect(nextRefNumber("experiment", state)).toBe(43);
  });

  it("takes one more than the highest ref on disk when project.yaml is behind", () => {
    const env = testEnv();
    let state = emptyState();
    state = must(createQuestion(state, { title: "One" }, env)).next;
    const question = at(state.questions, 0).file.frontmatter.id;
    for (const title of ["a", "b", "c"]) {
      state = must(
        createExperiment(state, { questionId: question, title }, env),
      ).next;
    }
    // Someone lowered the counter by hand.
    state = {
      ...state,
      project: {
        ...state.project,
        numbering: { next_question: 1, next_experiment: 1 },
      },
    };
    expect(nextRefNumber("experiment", state)).toBe(4);
    expect(nextRefNumber("question", state)).toBe(2);
  });

  it("counts refs held by files and folders that could not be read", () => {
    const state: NotebookState = {
      ...emptyState(),
      reservedRefs: ["EXP-007", "Q-012", "EXP-0009", "notes"],
    };
    expect(nextRefNumber("experiment", state)).toBe(10);
    expect(nextRefNumber("question", state)).toBe(13);
  });

  it("does not hand out the ref of a deleted experiment again", () => {
    const env = testEnv();
    let state = must(createQuestion(emptyState(), { title: "One" }, env)).next;
    const question = at(state.questions, 0).file.frontmatter.id;
    state = must(
      createExperiment(state, { questionId: question, title: "a" }, env),
    ).next;
    state = must(
      createExperiment(state, { questionId: question, title: "b" }, env),
    ).next;
    const last = at(state.experiments, 1).file.frontmatter.id;
    state = must(removeExperiment(state, last, env)).next;
    expect(state.experiments.map((e) => e.file.frontmatter.ref)).toEqual([
      "EXP-001",
    ]);
    const again = must(
      createExperiment(state, { questionId: question, title: "c" }, env),
    );
    expect(again.next.experiments.at(-1)?.file.frontmatter.ref).toBe("EXP-003");
  });
});
