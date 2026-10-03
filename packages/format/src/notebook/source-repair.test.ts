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
  createExperiment,
  createQuestion,
  editExperimentSection,
  replaceSource,
  type NotebookState,
} from "../index";

/** FR-CIT-08 (S5-G06): replacing a source rewrites its citekey in the text and nothing else. */

const OLD = "z:u:AAAA2222";
const NEW = "z:u:BBBB3333";
const KEPT = "z:u:CCCC4444";
const PROJECT = "_notebook/project.yaml";

function sample() {
  const env = testEnv();
  let state: NotebookState = emptyState();
  state = must(createQuestion(state, { title: "Q" }, env)).next;
  const question = at(state.questions, 0).file.frontmatter.id;
  for (const title of ["One", "Two", "Three"]) {
    state = must(
      createExperiment(state, { questionId: question, title }, env),
    ).next;
  }
  const ids = state.experiments.map((e) => e.file.frontmatter.id);
  const write = (
    id: string,
    key: "methods" | "interpretation",
    text: string,
  ) => {
    state = must(editExperimentSection(state, id, key, text, env)).next;
  };
  write(at(ids, 0), "methods", `Done as in [see @${OLD}, p. 3; @${KEPT}].`);
  write(at(ids, 0), "interpretation", `Agrees with @${OLD} [p. 4].`);
  write(at(ids, 1), "methods", `Only [@${KEPT}] here.`);
  return { env, state, one: at(ids, 0), two: at(ids, 1), three: at(ids, 2) };
}

function written(plan: {
  steps: readonly { kind: string; path: string; text?: string }[];
}) {
  return plan.steps.filter((s) => s.path.endsWith("experiment.md"));
}

describe("replaceSource", () => {
  it("rewrites every citation of the old key, in every section, and no other text", () => {
    const { env, state, one } = sample();
    const plan = must(replaceSource(state, { from: OLD, to: NEW }, env));
    const steps = written(plan);
    expect(steps).toHaveLength(1);
    const text = steps[0]?.text ?? "";
    const file = must(parseExperiment(text));
    const body = (key: string) =>
      file.body.sections.find((s) => s.key === key)?.body;
    expect(body("methods")).toBe(`Done as in [see @${NEW}, p. 3; @${KEPT}].`);
    expect(body("interpretation")).toBe(`Agrees with @${NEW} [p. 4].`);
    expect(file.frontmatter.id).toBe(one);
  });

  it("leaves experiments that do not cite the source out of the plan", () => {
    const { env, state, two, three } = sample();
    const plan = must(replaceSource(state, { from: OLD, to: NEW }, env));
    const paths = plan.steps.map((s) => s.path).join("\n");
    expect(paths).not.toContain(at(state.experiments, 1).folder);
    expect(paths).not.toContain(at(state.experiments, 2).folder);
    expect([two, three]).toHaveLength(2);
  });

  it("writes each experiment once and project.yaml last, once", () => {
    const { env, state } = sample();
    const plan = must(replaceSource(state, { from: OLD, to: NEW }, env));
    const paths = plan.steps.map((s) => s.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.filter((p) => p === PROJECT).length).toBeLessThanOrEqual(1);
    if (paths.includes(PROJECT)) expect(paths.at(-1)).toBe(PROJECT);
  });

  it("saves the regenerated block in the same write as the text", () => {
    const { env, state, one } = sample();
    const plan = must(
      replaceSource(
        state,
        { from: OLD, to: NEW, literature: { [one]: "1. New entry." } },
        env,
      ),
    );
    const file = must(parseExperiment(written(plan)[0]?.text ?? ""));
    expect(file.body.literature).toBe("1. New entry.");
  });

  it("leaves the block alone when none is given", () => {
    const { env, state } = sample();
    const plan = must(replaceSource(state, { from: OLD, to: NEW }, env));
    const file = must(parseExperiment(written(plan)[0]?.text ?? ""));
    expect(file.body.literature).toBeNull();
  });

  it("writes nothing, and is a no-op, once the text is already rewritten", () => {
    const { env, state } = sample();
    const first = must(replaceSource(state, { from: OLD, to: NEW }, env));
    const again = must(replaceSource(first.next, { from: OLD, to: NEW }, env));
    expect(again.steps).toEqual([]);
  });

  it("changes nothing in the state it returns apart from the citekeys", () => {
    const { env, state } = sample();
    const plan = must(replaceSource(state, { from: OLD, to: NEW }, env));
    const joined = JSON.stringify(plan.next.experiments).split(OLD).length;
    expect(joined).toBe(1);
    expect(plan.next.questions).toEqual(state.questions);
  });

  it("refuses a citekey that is not valid, or the same key", () => {
    const { env, state } = sample();
    for (const change of [
      { from: "nope", to: NEW },
      { from: OLD, to: "nope" },
      { from: OLD, to: OLD },
    ]) {
      expect(replaceSource(state, change, env).ok, JSON.stringify(change)).toBe(
        false,
      );
    }
  });

  it("refuses a block for an experiment that does not exist", () => {
    const { env, state } = sample();
    const refused = replaceSource(
      state,
      { from: OLD, to: NEW, literature: { nope: "x" } },
      env,
    );
    expect(refused).toMatchObject({
      ok: false,
      error: { kind: "notFound", entity: "experiment" },
    });
  });

  it("does not mutate the state it is given", () => {
    const { env, state, one } = sample();
    deepFreeze(state);
    expect(() =>
      replaceSource(
        state,
        { from: OLD, to: NEW, literature: { [one]: "x" } },
        env,
      ),
    ).not.toThrow();
  });
});
