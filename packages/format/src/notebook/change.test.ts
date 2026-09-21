import { describe, expect, it } from "vitest";
import {
  at,
  deepFreeze,
  emptyState,
  must,
  parsedExperiment,
  parsedQuestion,
  testEnv,
  textOf,
} from "../../test/notebook-support";
import { parseProject } from "../files";
import {
  arrangeNotebook,
  createExperiment,
  createQuestion,
  editExperiment,
  editQuestion,
  moveExperiment,
  removeExperiment,
  removeQuestion,
  type NotebookState,
} from "../index";

const PROJECT = "_notebook/project.yaml";

/** Two questions, and experiments EXP-001 and EXP-002 in the first. */
function sample(appVersion = "0.2.0") {
  const env = testEnv({ appVersion });
  let state = emptyState(appVersion);
  state = must(createQuestion(state, { title: "First" }, env)).next;
  state = must(createQuestion(state, { title: "Second" }, env)).next;
  const [first, second] = state.questions.map((q) => q.file.frontmatter.id);
  if (first === undefined || second === undefined)
    throw new Error("no questions");
  state = must(
    createExperiment(state, { questionId: first, title: "One" }, env),
  ).next;
  state = must(
    createExperiment(state, { questionId: first, title: "Two" }, env),
  ).next;
  const [one, two] = state.experiments.map((e) => e.file.frontmatter.id);
  if (one === undefined || two === undefined) throw new Error("no experiments");
  return { env, state, first, second, one, two };
}

describe("editExperiment (FR-EXP-05)", () => {
  it("changes title, status and dates in experiment.md and writes nothing else", () => {
    const { env, state, one } = sample();
    env.setNow("2026-09-22T08:15:30Z");
    const plan = must(
      editExperiment(
        state,
        one,
        {
          title: "PCA",
          status: "complete",
          started: "2026-09-02",
          completed: "2026-09-05",
        },
        env,
      ),
    );
    expect(plan.steps.map((s) => [s.kind, s.path])).toEqual([
      ["replace", "_notebook/experiments/EXP-001/experiment.md"],
    ]);
    const file = parsedExperiment(
      textOf(plan, "_notebook/experiments/EXP-001/experiment.md"),
    );
    expect(file.frontmatter).toMatchObject({
      title: "PCA",
      status: "complete",
      started: "2026-09-02",
      completed: "2026-09-05",
      created: "2026-09-21T10:00:00Z",
      updated: "2026-09-22T08:15:30Z",
    });
    expect(
      plan.next.experiments.find((e) => e.folder === "EXP-001")?.file,
    ).toEqual(file);
  });

  it("removes a date that is cleared instead of writing null", () => {
    const { env, state, one } = sample();
    const dated = must(
      editExperiment(state, one, { started: "2026-09-02" }, env),
    ).next;
    const plan = must(editExperiment(dated, one, { started: null }, env));
    const text = textOf(plan, "_notebook/experiments/EXP-001/experiment.md");
    expect(text).not.toMatch(/started/);
    expect(text).not.toMatch(/null/);
  });

  it("writes nothing when nothing changes, and leaves updated alone", () => {
    const { env, state, one } = sample();
    env.setNow("2026-10-01T00:00:00Z");
    const plan = must(
      editExperiment(state, one, { title: "One", status: "planned" }, env),
    );
    expect(plan.steps).toEqual([]);
    expect(plan.next).toBe(state);
  });

  it("refuses values the format does not allow", () => {
    const { env, state, one } = sample();
    const bad = [
      { title: "" },
      { title: "a\nb" },
      { status: "finished" },
      { started: "2026-02-30" },
      { completed: "yesterday" },
    ];
    for (const changes of bad) {
      // The cast is the test's point: a value typed by a person is not checked by the type.
      const result = editExperiment(state, one, changes as never, env);
      expect(result.ok, JSON.stringify(changes)).toBe(false);
    }
  });

  it("refuses an experiment that does not exist", () => {
    const { env, state } = sample();
    const result = editExperiment(
      state,
      "01JAXZZZZZZZZZZZZZZZZZZZZZ",
      { title: "x" },
      env,
    );
    expect(result.ok ? null : result.error.kind).toBe("notFound");
  });

  it("records the running version first when another version wrote the project last", () => {
    const { env, state, one } = sample();
    const older: NotebookState = {
      ...state,
      project: { ...state.project, last_written_by: "0.1.0" },
    };
    const plan = must(editExperiment(older, one, { status: "running" }, env));
    expect(plan.steps.map((s) => s.path)).toEqual([
      PROJECT,
      "_notebook/experiments/EXP-001/experiment.md",
    ]);
    expect(must(parseProject(textOf(plan, PROJECT))).last_written_by).toBe(
      "0.2.0",
    );
    expect(plan.next.project.last_written_by).toBe("0.2.0");
  });

  it("does not change the state it was given", () => {
    const { env, state, one } = sample();
    deepFreeze(state);
    expect(editExperiment(state, one, { title: "New" }, env).ok).toBe(true);
  });
});

describe("editQuestion", () => {
  it("changes the title and keeps the Motivation", () => {
    const { env, state, first } = sample();
    const withMotivation: NotebookState = {
      ...state,
      questions: state.questions.map((q) =>
        q.file.frontmatter.id === first
          ? { ...q, file: { ...q.file, body: "Why?" } }
          : q,
      ),
    };
    const plan = must(
      editQuestion(withMotivation, first, { title: "Renamed" }, env),
    );
    const written = parsedQuestion(
      textOf(plan, "_notebook/questions/Q-001.md"),
    );
    expect(written.frontmatter.title).toBe("Renamed");
    expect(written.body).toBe("Why?");
    expect(plan.steps).toHaveLength(1);
  });

  it("refuses an empty title and writes nothing when the title is the same", () => {
    const { env, state, first } = sample();
    expect(editQuestion(state, first, { title: "" }, env).ok).toBe(false);
    expect(
      must(editQuestion(state, first, { title: "First" }, env)).steps,
    ).toEqual([]);
  });
});

describe("moveExperiment (FR-EXP-04)", () => {
  it("changes the question value and both order lists, and leaves the folder alone", () => {
    const { env, state, second, one, two, first } = sample();
    const plan = must(moveExperiment(state, one, second, env));
    expect(plan.steps.map((s) => [s.kind, s.path])).toEqual([
      ["replace", "_notebook/experiments/EXP-001/experiment.md"],
      ["replace", PROJECT],
    ]);
    const file = parsedExperiment(
      textOf(plan, "_notebook/experiments/EXP-001/experiment.md"),
    );
    expect(file.frontmatter.question).toBe(second);
    const project = must(parseProject(textOf(plan, PROJECT)));
    expect(project.order).toEqual([
      { question: first, experiments: [two] },
      { question: second, experiments: [one] },
    ]);
    expect(plan.next.experiments.map((e) => e.folder)).toEqual([
      "EXP-001",
      "EXP-002",
    ]);
  });

  it("appends to the end of the target question and lists the experiment once", () => {
    const { env, state, first, second, one, two } = sample();
    const moved = must(moveExperiment(state, one, second, env)).next;
    const back = must(moveExperiment(moved, two, second, env)).next;
    const order = back.project.order;
    expect(order.find((e) => e.question === second)?.experiments).toEqual([
      one,
      two,
    ]);
    expect(order.flatMap((e) => e.experiments).sort()).toEqual(
      [one, two].sort(),
    );
    expect(order.find((e) => e.question === first)?.experiments).toEqual([]);
  });

  it("adds an order entry for a target question that has none", () => {
    const { env, state, one, second } = sample();
    const without: NotebookState = {
      ...state,
      project: {
        ...state.project,
        order: state.project.order.filter((e) => e.question !== second),
      },
    };
    const plan = must(moveExperiment(without, one, second, env));
    expect(plan.next.project.order.at(-1)).toEqual({
      question: second,
      experiments: [one],
    });
  });

  it("does nothing when the experiment is already in that question", () => {
    const { env, state, one, first } = sample();
    const plan = must(moveExperiment(state, one, first, env));
    expect(plan.steps).toEqual([]);
  });

  it("can move an experiment out of Unassigned into a question", () => {
    const { env, state, one, second } = sample();
    const orphaned: NotebookState = {
      ...state,
      questions: state.questions.filter(
        (q) =>
          q.file.frontmatter.id !==
          state.experiments[0]?.file.frontmatter.question,
      ),
    };
    const plan = must(moveExperiment(orphaned, one, second, env));
    expect(
      parsedExperiment(
        textOf(plan, "_notebook/experiments/EXP-001/experiment.md"),
      ).frontmatter.question,
    ).toBe(second);
  });

  it("refuses an experiment or a question that does not exist", () => {
    const { env, state, one, second } = sample();
    const gone = "01JAXZZZZZZZZZZZZZZZZZZZZZ";
    const noExperiment = moveExperiment(state, gone, second, env);
    const noQuestion = moveExperiment(state, one, gone, env);
    expect(noExperiment.ok ? null : noExperiment.error.kind).toBe("notFound");
    expect(noQuestion.ok ? null : noQuestion.error.kind).toBe("notFound");
  });

  it("does not change the state it was given", () => {
    const { env, state, one, second } = sample();
    deepFreeze(state);
    expect(moveExperiment(state, one, second, env).ok).toBe(true);
  });
});

describe("removeExperiment (FR-EXP-06)", () => {
  it("moves the experiment's folder to the trash, then drops it from the order", () => {
    const { env, state, one, two, first } = sample();
    const plan = must(removeExperiment(state, one, env));
    expect(plan.steps.map((s) => [s.kind, s.path])).toEqual([
      ["trash", "_notebook/experiments/EXP-001"],
      ["replace", PROJECT],
    ]);
    const project = must(parseProject(textOf(plan, PROJECT)));
    expect(
      project.order.find((e) => e.question === first)?.experiments,
    ).toEqual([two]);
    expect(plan.next.experiments.map((e) => e.folder)).toEqual(["EXP-002"]);
  });

  it("keeps the counter, so the ref is not issued again", () => {
    const { env, state, one } = sample();
    const plan = must(removeExperiment(state, one, env));
    expect(plan.next.project.numbering.next_experiment).toBe(3);
  });

  it("refuses an experiment that does not exist", () => {
    const { env, state } = sample();
    const result = removeExperiment(state, "01JAXZZZZZZZZZZZZZZZZZZZZZ", env);
    expect(result.ok ? null : result.error.kind).toBe("notFound");
  });
});

describe("removeQuestion (FR-EXP-06)", () => {
  it("moves only the question file to the trash and drops its entry from the order", () => {
    const { env, state, first, second } = sample();
    const plan = must(removeQuestion(state, first, env));
    expect(plan.steps.map((s) => [s.kind, s.path])).toEqual([
      ["trash", "_notebook/questions/Q-001.md"],
      ["replace", PROJECT],
    ]);
    const project = must(parseProject(textOf(plan, PROJECT)));
    expect(project.order).toEqual([{ question: second, experiments: [] }]);
    expect(plan.next.questions.map((q) => q.fileName)).toEqual(["Q-002.md"]);
  });

  it("leaves its experiments in place, shown as Unassigned", () => {
    const { env, state, first } = sample();
    const plan = must(removeQuestion(state, first, env));
    expect(plan.next.experiments).toHaveLength(2);
    const arranged = arrangeNotebook(plan.next);
    expect(arranged.unassigned.map((e) => e.experiment.folder)).toEqual([
      "EXP-001",
      "EXP-002",
    ]);
  });

  it("forgets that the question was collapsed", () => {
    const { env, state, first } = sample();
    const collapsed: NotebookState = {
      ...state,
      project: {
        ...state.project,
        table: { ...state.project.table, collapsed_questions: [first] },
      },
    };
    const plan = must(removeQuestion(collapsed, first, env));
    expect(plan.next.project.table.collapsed_questions).toEqual([]);
  });

  it("keeps the counter, so the ref is not issued again", () => {
    const { env, state, first } = sample();
    const plan = must(removeQuestion(state, first, env));
    const again = must(createQuestion(plan.next, { title: "New" }, env));
    expect(at(again.next.questions, 1).file.frontmatter.ref).toBe("Q-003");
  });
});

describe("what a project.yaml write drops (format-v1.md section 5)", () => {
  function withStaleEntries(unreadable: string[]) {
    const { env, state, first, second, one, two } = sample();
    const ghost = `01JAX${"7".repeat(21)}`;
    const stale: NotebookState = {
      ...state,
      unreadable,
      project: {
        ...state.project,
        order: [
          { question: ghost, experiments: [] },
          { question: first, experiments: [ghost, one] },
          // Listed under a question that is not the experiment's own.
          { question: second, experiments: [two] },
        ],
      },
    };
    return { env, stale, first, second, one, two, ghost };
  }

  it("drops entries naming no file, or an experiment under the wrong question", () => {
    const { env, stale, first, second, one } = withStaleEntries([]);
    const plan = must(createQuestion(stale, { title: "Third" }, env));
    const order = plan.next.project.order;
    expect(order.map((e) => e.question)).toEqual([
      first,
      second,
      at(plan.next.questions, 2).file.frontmatter.id,
    ]);
    expect(order.find((e) => e.question === first)?.experiments).toEqual([one]);
    expect(order.find((e) => e.question === second)?.experiments).toEqual([]);
  });

  it("keeps them when some file could not be read, because the entry may be its own", () => {
    const { env, stale, ghost } = withStaleEntries([
      "_notebook/questions/Q-009.md",
    ]);
    const plan = must(createQuestion(stale, { title: "Third" }, env));
    expect(plan.next.project.order.map((e) => e.question)).toContain(ghost);
  });
});
