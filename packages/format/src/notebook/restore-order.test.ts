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
import { parseBinNote } from "./bin-note";
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

/** Three questions, the second with two experiments. */
function three() {
  const env = testEnv({ appVersion: "0.2.0" });
  let state: NotebookState = emptyState("0.2.0");
  for (const title of ["First", "Second", "Third"]) {
    state = must(createQuestion(state, { title }, env)).next;
  }
  const ids = state.questions.map((q) => q.file.frontmatter.id);
  const [q1, q2, q3] = ids;
  if (q1 === undefined || q2 === undefined || q3 === undefined) {
    throw new Error("fixture");
  }
  for (const title of ["One", "Two"]) {
    state = must(createExperiment(state, { questionId: q2, title }, env)).next;
  }
  return { env, state, q1, q2, q3 };
}

const shownQuestions = (state: NotebookState) =>
  arrangeNotebook(state).questions.map((q) => q.question.file.frontmatter.id);

describe("adoptIntoOrder: a restored question keeps its place (ADR-0063)", () => {
  it("comes back between the questions it was between", () => {
    const { env, state, q1, q2, q3 } = three();
    const binned = must(removeQuestion(state, q2, env));
    const step = binned.steps.find((s) => s.path.endsWith("Q-002.md"));
    const note = step?.kind === "trash" ? parseBinNote(step.note ?? "") : null;
    expect(note).not.toBeNull();

    const plan = must(
      adoptIntoOrder(
        restoredAfter(state, binned.next),
        { questionFile: "Q-002.md", ...(note === null ? {} : { note }) },
        env,
      ),
    );

    expect(shownQuestions(plan.next)).toEqual([q1, q2, q3]);
    expect(plan.next.project.order.map((e) => e.question)).toEqual([
      q1,
      q2,
      q3,
    ]);
  });

  it("brings its experiments back in their saved order", () => {
    const { env, state, q2 } = three();
    const [one, two] = state.experiments.map((e) => e.file.frontmatter.id);
    const reversed: NotebookState = {
      ...state,
      project: {
        ...state.project,
        order: state.project.order.map((e) =>
          e.question === q2 ? { ...e, experiments: [two ?? "", one ?? ""] } : e,
        ),
      },
    };
    const binned = must(removeQuestion(reversed, q2, env));
    const step = binned.steps.find((s) => s.path.endsWith("Q-002.md"));
    const note = step?.kind === "trash" ? parseBinNote(step.note ?? "") : null;

    const plan = must(
      adoptIntoOrder(
        restoredAfter(reversed, binned.next),
        { questionFile: "Q-002.md", ...(note === null ? {} : { note }) },
        env,
      ),
    );

    expect(
      plan.next.project.order.find((e) => e.question === q2)?.experiments,
    ).toEqual([two, one]);
  });

  it("goes last when its old place is past the end", () => {
    const { env, state, q1, q2, q3 } = three();
    const binned = must(removeQuestion(state, q2, env));
    const plan = must(
      adoptIntoOrder(
        restoredAfter(state, binned.next),
        { questionFile: "Q-002.md", note: { index: 9, experiments: [] } },
        env,
      ),
    );
    expect(shownQuestions(plan.next)).toEqual([q1, q3, q2]);
  });

  it("goes last when nothing was noted, as before", () => {
    const { env, state, q1, q2, q3 } = three();
    const binned = must(removeQuestion(state, q2, env));
    const plan = must(
      adoptIntoOrder(
        restoredAfter(state, binned.next),
        { questionFile: "Q-002.md" },
        env,
      ),
    );
    expect(shownQuestions(plan.next)).toEqual([q1, q3, q2]);
  });
});

describe("adoptIntoOrder: the first of two questions (ADR-0063)", () => {
  it("comes back before the second, not after it", () => {
    const { env, state, first, second } = sample();
    const binned = must(removeQuestion(state, first, env));
    const step = binned.steps.find((s) => s.path.endsWith("Q-001.md"));
    const note = step?.kind === "trash" ? parseBinNote(step.note ?? "") : null;
    // What a reload finds: both questions' files, and the order without Q-001.
    const plan = must(
      adoptIntoOrder(
        restoredAfter(state, binned.next),
        { questionFile: "Q-001.md", ...(note === null ? {} : { note }) },
        env,
      ),
    );
    expect(shownQuestions(plan.next)).toEqual([first, second]);
  });
});

describe("adoptIntoOrder: a restored experiment keeps its place (ADR-0063)", () => {
  it("comes back at the index it had under its question", () => {
    const { env, state, q2 } = three();
    const [one, two] = state.experiments.map((e) => e.file.frontmatter.id);
    const binned = must(removeExperiment(state, one ?? "", env));
    const step = binned.steps[0];
    const note = step?.kind === "trash" ? parseBinNote(step.note ?? "") : null;

    const plan = must(
      adoptIntoOrder(
        restoredAfter(state, binned.next),
        { experimentFolder: "EXP-001", ...(note === null ? {} : { note }) },
        env,
      ),
    );

    expect(
      plan.next.project.order.find((e) => e.question === q2)?.experiments,
    ).toEqual([one, two]);
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
