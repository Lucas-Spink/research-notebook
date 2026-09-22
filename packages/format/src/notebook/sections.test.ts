import { describe, expect, it } from "vitest";
import {
  at,
  deepFreeze,
  emptyState,
  must,
  parsedExperiment,
  testEnv,
  textOf,
} from "../../test/notebook-support";
import {
  createExperiment,
  createQuestion,
  editExperimentSection,
} from "../index";

/** FR-EDT-03: editing one section's text, the way the expanded view autosaves it. */

function withExperiment() {
  const env = testEnv();
  let state = must(createQuestion(emptyState(), { title: "Q" }, env)).next;
  const question = at(state.questions, 0).file.frontmatter.id;
  state = must(
    createExperiment(state, { questionId: question, title: "One" }, env),
  ).next;
  const id = at(state.experiments, 0).file.frontmatter.id;
  return { env, state, id };
}

const EXPERIMENT_PATH = "_notebook/experiments/EXP-001/experiment.md";

describe("editExperimentSection", () => {
  it("writes only experiment.md, with the section's text and updated set to now", () => {
    const { env, state, id } = withExperiment();
    env.setNow("2026-09-22T09:00:00Z");
    const plan = must(
      editExperimentSection(
        state,
        id,
        "methods",
        "PCA on normalised counts.",
        env,
      ),
    );
    expect(plan.steps.map((s) => [s.kind, s.path])).toEqual([
      ["replace", EXPERIMENT_PATH],
    ]);
    const file = parsedExperiment(textOf(plan, EXPERIMENT_PATH));
    expect(file.body.sections).toEqual([
      { key: "methods", body: "PCA on normalised counts." },
      { key: "results_notes", body: "" },
      { key: "interpretation", body: "" },
    ]);
    expect(file.frontmatter.updated).toBe("2026-09-22T09:00:00Z");
  });

  it("changes only the named section; the others and their order are untouched", () => {
    const { env, state, id } = withExperiment();
    const withResults = must(
      editExperimentSection(
        state,
        id,
        "results_notes",
        "Signal separates.",
        env,
      ),
    ).next;
    const plan = must(
      editExperimentSection(
        withResults,
        id,
        "interpretation",
        "Consistent with prior work.",
        env,
      ),
    );
    const file = parsedExperiment(textOf(plan, EXPERIMENT_PATH));
    expect(file.body.sections).toEqual([
      { key: "methods", body: "" },
      { key: "results_notes", body: "Signal separates." },
      { key: "interpretation", body: "Consistent with prior work." },
    ]);
  });

  it("trims blank lines and normalises CRLF, as the format requires", () => {
    const { env, state, id } = withExperiment();
    const plan = must(
      editExperimentSection(
        state,
        id,
        "methods",
        "\n\nline one\r\nline two\n\n",
        env,
      ),
    );
    const file = parsedExperiment(textOf(plan, EXPERIMENT_PATH));
    expect(file.body.sections[0]).toEqual({
      key: "methods",
      body: "line one\nline two",
    });
  });

  it("writes nothing when the text is already what is stored", () => {
    const { env, state, id } = withExperiment();
    const plan = must(editExperimentSection(state, id, "methods", "", env));
    expect(plan.steps).toEqual([]);
    expect(plan.next).toBe(state);
  });

  it("carries the preamble, unknown sections and the literature block through unchanged", () => {
    const { env, state, id } = withExperiment();
    const withExtras: typeof state = {
      ...state,
      experiments: state.experiments.map((e) =>
        e.file.frontmatter.id === id
          ? {
              ...e,
              file: {
                ...e.file,
                body: {
                  preamble: "Some preamble text.",
                  sections: [
                    { key: "unknown", heading: "Notes", body: "hand-written" },
                    ...e.file.body.sections,
                  ],
                  literature: "1. Someone (2020).",
                },
              },
            }
          : e,
      ),
    };
    const plan = must(
      editExperimentSection(
        withExtras,
        id,
        "methods",
        "New methods text.",
        env,
      ),
    );
    const file = parsedExperiment(textOf(plan, EXPERIMENT_PATH));
    expect(file.body.preamble).toBe("Some preamble text.");
    expect(file.body.sections[0]).toEqual({
      key: "unknown",
      heading: "Notes",
      body: "hand-written",
    });
    expect(file.body.literature).toBe("1. Someone (2020).");
  });

  it("refuses text with a level-2 heading, and changes nothing", () => {
    const { env, state, id } = withExperiment();
    const result = editExperimentSection(
      state,
      id,
      "methods",
      "para\n\n## Sneaky\n\nmore",
      env,
    );
    if (result.ok) throw new Error("expected a refusal");
    expect(result.error).toMatchObject({ kind: "invalid", field: "text" });
  });

  it("refuses text with literature block markers", () => {
    const { env, state, id } = withExperiment();
    const result = editExperimentSection(
      state,
      id,
      "interpretation",
      "<!-- literature:start -->\nx\n<!-- literature:end -->",
      env,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses text that leaves a code fence open", () => {
    const { env, state, id } = withExperiment();
    const result = editExperimentSection(
      state,
      id,
      "methods",
      "```r\nx <- 1",
      env,
    );
    expect(result.ok).toBe(false);
  });

  it("refuses an experiment that does not exist", () => {
    const { env, state } = withExperiment();
    const result = editExperimentSection(
      state,
      "01JAXZZZZZZZZZZZZZZZZZZZZZ",
      "methods",
      "x",
      env,
    );
    expect(result.ok ? null : result.error.kind).toBe("notFound");
  });

  it("records the running version first when another version wrote the project last", () => {
    const { env, state, id } = withExperiment();
    const older = {
      ...state,
      project: { ...state.project, last_written_by: "0.1.0" },
    };
    const plan = must(editExperimentSection(older, id, "methods", "x", env));
    expect(plan.steps.map((s) => s.path)).toEqual([
      "_notebook/project.yaml",
      EXPERIMENT_PATH,
    ]);
    expect(plan.next.project.last_written_by).toBe("0.2.0");
  });

  it("does not change the state it was given", () => {
    const { env, state, id } = withExperiment();
    deepFreeze(state);
    expect(editExperimentSection(state, id, "methods", "x", env).ok).toBe(true);
  });
});
