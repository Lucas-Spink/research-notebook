import { describe, expect, it } from "vitest";
import { emptyState, must, testEnv } from "../../test/notebook-support";
import {
  arrangeNotebook,
  createExperiment,
  createQuestion,
  removeExperiment,
  removeQuestion,
  type NotebookState,
} from "../index";
import { adoptIntoOrder } from "./restore-order";

/** Two questions, and two experiments in the first. */
function sample() {
  const env = testEnv({ appVersion: "0.2.0" });
  let state: NotebookState = must(
    createQuestion(emptyState("0.2.0"), { title: "First" }, env),
  ).next;
  state = must(createQuestion(state, { title: "Second" }, env)).next;
  const [first, second] = state.questions.map((q) => q.file.frontmatter.id);
  if (first === undefined || second === undefined) throw new Error("fixture");
  state = must(
    createExperiment(state, { questionId: first, title: "One" }, env),
  ).next;
  state = must(
    createExperiment(state, { questionId: first, title: "Two" }, env),
  ).next;
  const [one, two] = state.experiments.map((e) => e.file.frontmatter.id);
  if (one === undefined || two === undefined) throw new Error("fixture");
  return { env, state, first, second, one, two };
}

/**
 * The state after the files of what was deleted are put back by Rust, but
 * `project.yaml` is as the deletion left it: that is what a restore finds.
 */
function restoredAfter(
  before: NotebookState,
  deleted: NotebookState,
): NotebookState {
  return { ...before, project: deleted.project };
}

describe("adoptIntoOrder: a restored question", () => {
  it("lists the question and its experiments in the saved order again", () => {
    const { env, state, first, one, two } = sample();
    const deleted = must(removeQuestion(state, first, env)).next;
    const restored = restoredAfter(state, deleted);
    // The deletion dropped the question and its experiments from the order.
    expect(restored.project.order.map((e) => e.question)).not.toContain(first);

    const fileName = state.questions[0]?.fileName ?? "";
    const plan = must(
      adoptIntoOrder(restored, { questionFile: fileName }, env),
    );

    const entry = plan.next.project.order.find((e) => e.question === first);
    expect(entry?.experiments).toEqual([one, two]);
    expect(plan.steps.map((s) => s.kind)).toEqual(["replace"]);
  });

  it("leaves no experiment flagged as missing from the order", () => {
    const { env, state, first } = sample();
    const deleted = must(removeQuestion(state, first, env)).next;
    const restored = restoredAfter(state, deleted);
    const plan = must(
      adoptIntoOrder(
        restored,
        { questionFile: state.questions[0]?.fileName ?? "" },
        env,
      ),
    );
    const shown = arrangeNotebook(plan.next).questions.flatMap((q) =>
      q.experiments.map((e) => e.absentFromOrder),
    );
    expect(shown).toEqual([false, false]);
  });

  it("changes nothing when the question is already in the order", () => {
    const { env, state } = sample();
    const plan = must(
      adoptIntoOrder(
        state,
        { questionFile: state.questions[0]?.fileName ?? "" },
        env,
      ),
    );
    expect(plan.steps).toEqual([]);
  });

  it("changes nothing for a question that is not there", () => {
    const { env, state } = sample();
    const plan = must(adoptIntoOrder(state, { questionFile: "Q-404.md" }, env));
    expect(plan.steps).toEqual([]);
  });
});

describe("adoptIntoOrder: a restored experiment", () => {
  it("puts it back under its question, at the end", () => {
    const { env, state, first, one, two } = sample();
    const deleted = must(removeExperiment(state, one, env)).next;
    const restored = restoredAfter(state, deleted);
    const folder =
      state.experiments.find((e) => e.file.frontmatter.id === one)?.folder ??
      "";

    const plan = must(
      adoptIntoOrder(restored, { experimentFolder: folder }, env),
    );

    const entry = plan.next.project.order.find((e) => e.question === first);
    expect(entry?.experiments).toEqual([two, one]);
  });

  it("does not list an experiment twice", () => {
    const { env, state, one } = sample();
    const folder =
      state.experiments.find((e) => e.file.frontmatter.id === one)?.folder ??
      "";
    const plan = must(adoptIntoOrder(state, { experimentFolder: folder }, env));
    expect(plan.steps).toEqual([]);
  });

  it("leaves an experiment of a question with no file out, as it is shown unassigned", () => {
    const { env, state, first, one } = sample();
    const questionless = {
      ...state,
      questions: state.questions.filter((q) => q.file.frontmatter.id !== first),
      project: {
        ...state.project,
        order: state.project.order.filter((e) => e.question !== first),
      },
    };
    const folder =
      state.experiments.find((e) => e.file.frontmatter.id === one)?.folder ??
      "";
    const plan = must(
      adoptIntoOrder(questionless, { experimentFolder: folder }, env),
    );
    expect(plan.steps).toEqual([]);
  });
});
