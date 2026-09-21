import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { emptyState, must, testEnv } from "../../test/notebook-support";
import { parseExperiment, parseProject, parseQuestion } from "../files";
import {
  serialiseExperiment,
  serialiseProject,
  serialiseQuestion,
} from "../index";
import {
  arrangeNotebook,
  createExperiment,
  createQuestion,
  editExperiment,
  moveExperiment,
  removeExperiment,
  removeQuestion,
  type NotebookState,
  type Plan,
} from "../index";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

/**
 * Gate S2-G02 for the operations of S2-T10: whatever sequence of creates,
 * moves, edits and deletes the person makes, the files the application writes
 * parse back to the model it holds, and a ref is never issued twice (FR-EXP-03).
 */

type Op =
  | { kind: "question" }
  | { kind: "experiment"; question: number }
  | { kind: "removeExperiment"; index: number }
  | { kind: "removeQuestion"; index: number }
  | { kind: "move"; index: number; question: number }
  | { kind: "edit"; index: number; status: number }
  | { kind: "lowerCounters" };

const op = (allowLowering: boolean): fc.Arbitrary<Op> =>
  fc.oneof(
    { weight: 3, arbitrary: fc.constant<Op>({ kind: "question" }) },
    {
      weight: 6,
      arbitrary: fc
        .nat(9)
        .map((question): Op => ({ kind: "experiment", question })),
    },
    {
      weight: 2,
      arbitrary: fc
        .nat(9)
        .map((index): Op => ({ kind: "removeExperiment", index })),
    },
    {
      weight: 1,
      arbitrary: fc
        .nat(9)
        .map((index): Op => ({ kind: "removeQuestion", index })),
    },
    {
      weight: 3,
      arbitrary: fc
        .tuple(fc.nat(9), fc.nat(9))
        .map(([index, question]): Op => ({ kind: "move", index, question })),
    },
    {
      weight: 2,
      arbitrary: fc
        .tuple(fc.nat(9), fc.nat(3))
        .map(([index, status]): Op => ({ kind: "edit", index, status })),
    },
    ...(allowLowering
      ? [{ weight: 1, arbitrary: fc.constant<Op>({ kind: "lowerCounters" }) }]
      : []),
  );

const STATUSES = ["planned", "running", "complete", "abandoned"] as const;

/** Applies one operation; `null` when it does not apply to the state (nothing to pick). */
function apply(
  state: NotebookState,
  step: Op,
  env: ReturnType<typeof testEnv>,
  n: number,
) {
  const questionAt = (i: number) =>
    state.questions[i % Math.max(state.questions.length, 1)];
  const experimentAt = (i: number) =>
    state.experiments[i % Math.max(state.experiments.length, 1)];
  switch (step.kind) {
    case "question":
      return createQuestion(state, { title: `Question ${n}` }, env);
    case "experiment": {
      const question = questionAt(step.question);
      return question === undefined
        ? null
        : createExperiment(
            state,
            {
              questionId: question.file.frontmatter.id,
              title: `Experiment ${n}`,
            },
            env,
          );
    }
    case "removeExperiment": {
      const experiment = experimentAt(step.index);
      return experiment === undefined
        ? null
        : removeExperiment(state, experiment.file.frontmatter.id, env);
    }
    case "removeQuestion": {
      const question = questionAt(step.index);
      return question === undefined
        ? null
        : removeQuestion(state, question.file.frontmatter.id, env);
    }
    case "move": {
      const experiment = experimentAt(step.index);
      const question = questionAt(step.question);
      return experiment === undefined || question === undefined
        ? null
        : moveExperiment(
            state,
            experiment.file.frontmatter.id,
            question.file.frontmatter.id,
            env,
          );
    }
    case "edit": {
      const experiment = experimentAt(step.index);
      return experiment === undefined
        ? null
        : editExperiment(
            state,
            experiment.file.frontmatter.id,
            { status: STATUSES[step.status] ?? "planned" },
            env,
          );
    }
    case "lowerCounters":
      return null;
  }
}

function assertFilesRoundTrip(state: NotebookState, plan: Plan) {
  expect(must(parseProject(serialiseProject(state.project)))).toEqual(
    state.project,
  );
  for (const question of state.questions) {
    expect(must(parseQuestion(serialiseQuestion(question.file)))).toEqual(
      question.file,
    );
  }
  for (const experiment of state.experiments) {
    expect(must(parseExperiment(serialiseExperiment(experiment.file)))).toEqual(
      experiment.file,
    );
  }
  for (const step of plan.steps) {
    if (step.kind === "trash") continue;
    expect(step.text.endsWith("\n")).toBe(true);
    expect(step.text.includes("\r")).toBe(false);
  }
}

function run(ops: readonly Op[], allowLowering: boolean) {
  const env = testEnv();
  let state = emptyState();
  const issued = new Set<string>();
  let n = 0;
  for (const step of ops) {
    n += 1;
    if (step.kind === "lowerCounters") {
      state = {
        ...state,
        project: {
          ...state.project,
          numbering: { next_question: 1, next_experiment: 1 },
        },
      };
      continue;
    }
    const result = apply(state, step, env, n);
    if (result === null) continue;
    const plan = must(result);
    const before = new Set([
      ...state.questions.map((q) => q.file.frontmatter.ref),
      ...state.experiments.map((e) => e.file.frontmatter.ref),
    ]);
    state = plan.next;
    assertFilesRoundTrip(state, plan);
    for (const ref of [
      ...state.questions.map((q) => q.file.frontmatter.ref),
      ...state.experiments.map((e) => e.file.frontmatter.ref),
    ]) {
      if (before.has(ref)) continue;
      // A new ref: it must not be one issued before, unless a person lowered the counter and the old file is gone.
      if (!allowLowering)
        expect(issued.has(ref), `${ref} was issued twice`).toBe(false);
      issued.add(ref);
    }
    const arranged = arrangeNotebook(state);
    expect(arranged.problems, JSON.stringify(arranged.problems)).toEqual([]);
    const listed = state.project.order.flatMap((e) => e.experiments);
    expect(new Set(listed).size).toBe(listed.length);
  }
}

describe("project-model: operations on the notebook (S2-G02)", () => {
  it("files round-trip and no ref is ever issued twice, whatever the sequence", () => {
    fc.assert(
      fc.property(fc.array(op(false), { maxLength: 40 }), (ops) =>
        run(ops, false),
      ),
      { numRuns },
    );
  });

  it("with the counter lowered by hand, no two live files share a ref", () => {
    fc.assert(
      fc.property(fc.array(op(true), { maxLength: 40 }), (ops) =>
        run(ops, true),
      ),
      { numRuns },
    );
  });
});
