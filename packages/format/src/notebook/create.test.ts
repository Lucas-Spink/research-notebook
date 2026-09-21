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
import { parseArtefacts, parseProject } from "../files";
import { createExperiment, createQuestion } from "../index";

const PROJECT = "_notebook/project.yaml";

function stateWithQuestion(env = testEnv()) {
  const plan = must(
    createQuestion(emptyState("0.1.0"), { title: "Batch effects?" }, env),
  );
  return {
    env,
    plan,
    state: plan.next,
    id: at(plan.next.questions, 0).file.frontmatter.id,
  };
}

describe("createQuestion (FR-EXP-01)", () => {
  it("writes the question file, then project.yaml", () => {
    const { plan } = stateWithQuestion();
    expect(plan.steps.map((s) => [s.kind, s.path])).toEqual([
      ["create", "_notebook/questions/Q-001.md"],
      ["replace", PROJECT],
    ]);
  });

  it("gives the question a new ULID, the next ref and the time it was made", () => {
    const { plan, id } = stateWithQuestion();
    const written = parsedQuestion(
      textOf(plan, "_notebook/questions/Q-001.md"),
    );
    expect(written.frontmatter).toEqual({
      id,
      ref: "Q-001",
      title: "Batch effects?",
      created: "2026-09-21T10:00:00Z",
    });
    expect(written.body).toBe("");
  });

  it("counts on in project.yaml, appends the question to the order and records the writer", () => {
    const { plan, id } = stateWithQuestion();
    const project = must(parseProject(textOf(plan, PROJECT)));
    expect(project.numbering).toEqual({ next_question: 2, next_experiment: 1 });
    expect(project.order).toEqual([{ question: id, experiments: [] }]);
    expect(project.last_written_by).toBe("0.2.0");
    expect(plan.next.project).toEqual(project);
  });

  it("numbers the second question Q-002", () => {
    const env = testEnv();
    const { state } = stateWithQuestion(env);
    const second = must(createQuestion(state, { title: "Second" }, env));
    expect(at(second.next.questions, 1).file.frontmatter.ref).toBe("Q-002");
    expect(at(second.next.questions, 1).fileName).toBe("Q-002.md");
    expect(second.next.project.order.map((e) => e.question)).toEqual(
      second.next.questions.map((q) => q.file.frontmatter.id),
    );
  });

  it("trims the title and refuses one that is empty or has a line break", () => {
    const env = testEnv();
    const trimmed = must(
      createQuestion(emptyState(), { title: "  Why?  " }, env),
    );
    expect(at(trimmed.next.questions, 0).file.frontmatter.title).toBe("Why?");
    for (const title of ["", "   ", "two\nlines", "tab\there"]) {
      const result = createQuestion(emptyState(), { title }, env);
      expect(result.ok, JSON.stringify(title)).toBe(false);
    }
  });

  it("does not change the state it was given", () => {
    const state = deepFreeze(emptyState());
    expect(createQuestion(state, { title: "Q" }, testEnv()).ok).toBe(true);
  });

  it("writes LF text with no byte-order mark", () => {
    const { plan } = stateWithQuestion();
    for (const step of plan.steps) {
      if (step.kind === "trash") continue;
      expect(step.text.includes("\r")).toBe(false);
      expect(step.text.startsWith("﻿")).toBe(false);
      expect(step.text.endsWith("\n")).toBe(true);
    }
  });
});

describe("createExperiment (FR-EXP-02)", () => {
  function withExperiment(title = "PCA") {
    const env = testEnv();
    const { state, id } = stateWithQuestion(env);
    const plan = must(createExperiment(state, { questionId: id, title }, env));
    return { plan, id, state };
  }

  it("writes experiment.md, an empty artefacts.yaml, then project.yaml", () => {
    const { plan } = withExperiment();
    expect(plan.steps.map((s) => [s.kind, s.path])).toEqual([
      ["create", "_notebook/experiments/EXP-001/experiment.md"],
      ["create", "_notebook/experiments/EXP-001/artefacts.yaml"],
      ["replace", PROJECT],
    ]);
  });

  it("gives the experiment a new ULID, the next ref and status planned", () => {
    const { plan, id } = withExperiment("PCA of batch");
    const file = parsedExperiment(
      textOf(plan, "_notebook/experiments/EXP-001/experiment.md"),
    );
    expect(file.frontmatter).toEqual({
      id: at(plan.next.experiments, 0).file.frontmatter.id,
      ref: "EXP-001",
      question: id,
      title: "PCA of batch",
      status: "planned",
      created: "2026-09-21T10:00:00Z",
      updated: "2026-09-21T10:00:00Z",
    });
    expect(file.frontmatter).not.toHaveProperty("started");
    expect(file.frontmatter).not.toHaveProperty("completed");
  });

  it("starts with the three empty sections in canonical order", () => {
    const { plan } = withExperiment();
    const file = parsedExperiment(
      textOf(plan, "_notebook/experiments/EXP-001/experiment.md"),
    );
    expect(file.body).toEqual({
      preamble: "",
      sections: [
        { key: "methods", body: "" },
        { key: "results_notes", body: "" },
        { key: "interpretation", body: "" },
      ],
      literature: null,
    });
    expect(textOf(plan, "_notebook/experiments/EXP-001/experiment.md")).toMatch(
      /---\n\n## Methods\n\n## Results notes\n\n## Interpretation\n$/,
    );
  });

  it("writes an artefacts.yaml with no artefacts and no groups", () => {
    const { plan } = withExperiment();
    const text = textOf(plan, "_notebook/experiments/EXP-001/artefacts.yaml");
    expect(must(parseArtefacts(text))).toEqual({
      format_version: 1,
      artefacts: [],
      groups: [],
    });
  });

  it("appends the experiment to the question's order and counts on", () => {
    const env = testEnv();
    const { state, id } = stateWithQuestion(env);
    const first = must(
      createExperiment(state, { questionId: id, title: "a" }, env),
    );
    const second = must(
      createExperiment(first.next, { questionId: id, title: "b" }, env),
    );
    const project = must(parseProject(textOf(second, PROJECT)));
    expect(project.order).toEqual([
      {
        question: id,
        experiments: second.next.experiments.map((e) => e.file.frontmatter.id),
      },
    ]);
    expect(project.numbering.next_experiment).toBe(3);
    expect(second.next.experiments.map((e) => e.folder)).toEqual([
      "EXP-001",
      "EXP-002",
    ]);
  });

  it("refuses a question that does not exist and an empty title", () => {
    const env = testEnv();
    const { state, id } = stateWithQuestion(env);
    const missing = createExperiment(
      state,
      { questionId: "01JAXZZZZZZZZZZZZZZZZZZZZZ", title: "a" },
      env,
    );
    expect(missing.ok ? null : missing.error.kind).toBe("notFound");
    const empty = createExperiment(state, { questionId: id, title: " " }, env);
    expect(empty.ok ? null : empty.error.kind).toBe("invalid");
  });

  it("gives the experiment a fresh identifier even when the generator repeats one", () => {
    const state = must(
      createQuestion(emptyState(), { title: "Q" }, testEnv()),
    ).next;
    const id = at(state.questions, 0).file.frontmatter.id;
    const stuck = testEnv({ newId: () => id });
    const result = createExperiment(
      state,
      { questionId: id, title: "a" },
      stuck,
    );
    expect(result.ok).toBe(false);
  });

  it("does not change the state it was given", () => {
    const { env, state, id } = stateWithQuestion();
    deepFreeze(state);
    expect(
      createExperiment(state, { questionId: id, title: "a" }, env).ok,
    ).toBe(true);
  });
});
