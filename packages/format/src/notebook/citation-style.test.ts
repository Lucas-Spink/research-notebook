import { describe, expect, it } from "vitest";
import {
  at,
  deepFreeze,
  emptyState,
  must,
  testEnv,
} from "../../test/notebook-support";
import { parseExperiment } from "../files";
import {
  changeCitationStyle,
  createExperiment,
  createQuestion,
  editExperimentSection,
  type NotebookState,
} from "../index";

/** FR-CIT-10 and FR-CIT-11: choosing a style copies it into styles/, names it in project.yaml and regenerates every Literature block in one plan. */

const PROJECT = "_notebook/project.yaml";
const CSL = "<style/>";

function sample() {
  const env = testEnv();
  let state: NotebookState = emptyState();
  state = must(createQuestion(state, { title: "Q" }, env)).next;
  const question = at(state.questions, 0).file.frontmatter.id;
  for (const title of ["One", "Two"]) {
    state = must(
      createExperiment(state, { questionId: question, title }, env),
    ).next;
  }
  const ids = state.experiments.map((e) => e.file.frontmatter.id);
  state = must(
    editExperimentSection(state, at(ids, 0), "methods", "Kept text.", env, {
      literature: "1. Old entry.",
    }),
  ).next;
  return { env, state, one: at(ids, 0), two: at(ids, 1) };
}

describe("changeCitationStyle", () => {
  it("changes only citation_style, stamping the writer, in one write", () => {
    const { env, state } = sample();
    const plan = must(changeCitationStyle(state, { file: "numeric.csl" }, env));
    expect(plan.steps.map((s) => [s.kind, s.path])).toEqual([
      ["replace", PROJECT],
    ]);
    expect(plan.next.project.citation_style).toBe("numeric.csl");
    expect(plan.next.project.name).toBe(state.project.name);
  });

  it("creates the style file first and writes project.yaml last", () => {
    const { env, state, one } = sample();
    const plan = must(
      changeCitationStyle(
        state,
        {
          file: "numeric.csl",
          copy: CSL,
          literature: { [one]: "1. New entry." },
        },
        env,
      ),
    );
    const paths = plan.steps.map((s) => [s.kind, s.path]);
    expect(paths[0]).toEqual(["create", "_notebook/styles/numeric.csl"]);
    expect(paths.at(-1)).toEqual(["replace", PROJECT]);
    expect(paths.filter(([, path]) => path === PROJECT)).toHaveLength(1);
    expect(plan.steps[0]).toMatchObject({ text: CSL });
  });

  it("rewrites the literature block and leaves section text unchanged", () => {
    const { env, state, one } = sample();
    const plan = must(
      changeCitationStyle(
        state,
        { file: "author-date.csl", literature: { [one]: "Smith (2020)." } },
        env,
      ),
    );
    const step = plan.steps.find((s) => s.path.includes("experiment.md"));
    if (step === undefined || step.kind === "trash") throw new Error("no step");
    const file = must(parseExperiment(step.text));
    expect(file.body.literature).toBe("Smith (2020).");
    expect(file.body.sections.find((s) => s.key === "methods")?.body).toBe(
      "Kept text.",
    );
  });

  it("writes nothing for the style already named and no new blocks", () => {
    const { env, state } = sample();
    const named = state.project.citation_style;
    const plan = must(changeCitationStyle(state, { file: named }, env));
    expect(plan.steps).toEqual([]);
  });

  it("still regenerates blocks when the same style is chosen again", () => {
    const { env, state, one } = sample();
    const plan = must(
      changeCitationStyle(
        state,
        { file: state.project.citation_style, literature: { [one]: "X." } },
        env,
      ),
    );
    expect(plan.steps.map((s) => s.kind)).toEqual(["replace"]);
    expect(plan.steps[0]?.path).toContain("experiment.md");
  });

  it("refuses a name that is not a plain .csl file name", () => {
    const { env, state } = sample();
    for (const file of ["a/b.csl", "x.txt", "..\\y.csl", ""]) {
      const refused = changeCitationStyle(state, { file }, env);
      expect(refused.ok, file).toBe(false);
    }
  });

  it("refuses a block for an experiment that does not exist", () => {
    const { env, state } = sample();
    const refused = changeCitationStyle(
      state,
      { file: "numeric.csl", literature: { nope: "x" } },
      env,
    );
    expect(refused).toMatchObject({
      ok: false,
      error: { kind: "notFound", entity: "experiment" },
    });
  });

  it("does not change the state it is given", () => {
    const { env, state, one } = sample();
    deepFreeze(state);
    expect(() =>
      changeCitationStyle(
        state,
        { file: "numeric.csl", copy: CSL, literature: { [one]: "x" } },
        env,
      ),
    ).not.toThrow();
  });
});
