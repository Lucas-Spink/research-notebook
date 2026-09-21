import { describe, expect, it } from "vitest";
import {
  at,
  emptyState,
  must,
  parsedExperiment,
  testEnv,
  textOf,
} from "../../test/notebook-support";
import { parseProject } from "../files";
import {
  createQuestion,
  editExperiment,
  moveExperiment,
  serialiseExperiment,
  serialiseProject,
  type NotebookState,
} from "../index";

/** Gate S2-G03 for the operations of S2-T10: what the format does not know survives an edit. */

const EXPERIMENT_PATH = "_notebook/experiments/EXP-042/experiment.md";

function experimentText(
  question: string,
  title: string,
  updated: string,
): string {
  return `---
id: "01JAXQ8M3K7T2V9R4W6Y5Z0B1C"
ref: "EXP-042"
question: "${question}"
title: "${title}"
status: "running"
created: "2026-09-02T08:30:00Z"
updated: "${updated}"
x_lab_note: "keep me"
x_nested:
  a: 1
  b:
    - "x"
---

Preamble before any heading.

## Methods

Run it.

| a | b |
| - | - |
| 1 | 2 |

<div>raw html</div>

## Lab diary

An unknown section.

## Results notes

Notes.

<!-- literature:start -->
## Literature

1. Something.
<!-- literature:end -->
`;
}

function withUnknownContent() {
  const env = testEnv();
  let state = emptyState();
  state = must(createQuestion(state, { title: "One" }, env)).next;
  state = must(createQuestion(state, { title: "Two" }, env)).next;
  const [first, second] = state.questions.map((q) => q.file.frontmatter.id);
  if (first === undefined || second === undefined)
    throw new Error("no questions");
  const original = experimentText(first, "PCA", "2026-09-05T16:11:42Z");
  const file = parsedExperiment(original);
  expect(serialiseExperiment(file)).toBe(original);
  const loaded: NotebookState = {
    ...state,
    experiments: [{ folder: "EXP-042", file }],
    project: {
      ...state.project,
      numbering: { next_question: 3, next_experiment: 43 },
      order: state.project.order.map((e) =>
        e.question === first ? { ...e, experiments: [file.frontmatter.id] } : e,
      ),
    },
  };
  return { env, loaded, first, second, id: file.frontmatter.id };
}

describe("preserve-unknown: edits to experiment.md", () => {
  it("changes only the edited lines when the title is edited", () => {
    const { env, loaded, first, id } = withUnknownContent();
    env.setNow("2026-09-22T08:15:30Z");
    const plan = must(
      editExperiment(loaded, id, { title: "PCA of batch" }, env),
    );
    expect(textOf(plan, EXPERIMENT_PATH)).toBe(
      experimentText(first, "PCA of batch", "2026-09-22T08:15:30Z"),
    );
  });

  it("changes only the question line when the experiment is moved", () => {
    const { env, loaded, second, id } = withUnknownContent();
    env.setNow("2026-09-22T08:15:30Z");
    const plan = must(moveExperiment(loaded, id, second, env));
    expect(textOf(plan, EXPERIMENT_PATH)).toBe(
      experimentText(second, "PCA", "2026-09-22T08:15:30Z"),
    );
  });
});

describe("preserve-unknown: edits to project.yaml", () => {
  it("keeps unknown keys at every level when a question is created", () => {
    const base = emptyState();
    const project = must(
      parseProject(
        serialiseProject(base.project).replace(
          "  next_experiment: 1\n",
          '  next_experiment: 1\n  x_hint: "kept"\n',
        ) + 'x_top:\n  - "a"\n',
      ),
    );
    const plan = must(
      createQuestion({ ...base, project }, { title: "Q" }, testEnv()),
    );
    const written = must(parseProject(textOf(plan, "_notebook/project.yaml")));
    expect(written).toMatchObject({
      x_top: ["a"],
      numbering: { x_hint: "kept", next_question: 2 },
    });
    expect(at(plan.next.questions, 0).file.frontmatter.ref).toBe("Q-001");
  });
});
