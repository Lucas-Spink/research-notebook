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
  editExperimentLiterature,
  editExperimentSection,
  setExperimentLiterature,
} from "../index";

/** FR-CIT-10: the Literature block is rewritten in the same write as the section that changed it. */

const EXPERIMENT_PATH = "_notebook/experiments/EXP-001/experiment.md";

function withExperiment() {
  const env = testEnv();
  let state = must(createQuestion(emptyState(), { title: "Q" }, env)).next;
  const question = at(state.questions, 0).file.frontmatter.id;
  state = must(
    createExperiment(state, { questionId: question, title: "One" }, env),
  ).next;
  return { env, state, id: at(state.experiments, 0).file.frontmatter.id };
}

describe("setExperimentLiterature", () => {
  const body = {
    preamble: "",
    sections: [{ key: "methods" as const, body: "text" }],
    literature: null,
  };

  it("sets the block and leaves everything else alone", () => {
    const result = must(
      setExperimentLiterature(body, "## Literature\n\n1. A."),
    );
    expect(result).toEqual({ ...body, literature: "## Literature\n\n1. A." });
  });

  it("normalises line endings and trims edge blank lines, like a read would", () => {
    const result = must(setExperimentLiterature(body, "\n1. A.\r\n2. B.\n\n"));
    expect(result.literature).toBe("1. A.\n2. B.");
  });

  it("refuses content with a literature marker, which would corrupt the file", () => {
    const refused = setExperimentLiterature(body, "x\n<!-- literature:end -->");
    expect(refused.ok).toBe(false);
  });

  it("does not change its input", () => {
    const frozen = deepFreeze(structuredClone(body));
    setExperimentLiterature(frozen, "1. A.");
    expect(frozen.literature).toBeNull();
  });
});

describe("editExperimentLiterature", () => {
  it("writes only experiment.md, changing only the literature block", () => {
    const { env, state, id } = withExperiment();
    env.setNow("2026-10-02T09:00:00Z");
    const plan = must(editExperimentLiterature(state, id, "1. A.", env));
    expect(plan.steps.map((s) => [s.kind, s.path])).toEqual([
      ["replace", EXPERIMENT_PATH],
    ]);
    const file = parsedExperiment(textOf(plan, EXPERIMENT_PATH));
    expect(file.body.literature).toBe("1. A.");
    expect(file.body.sections).toEqual(
      at(state.experiments, 0).file.body.sections,
    );
    expect(file.frontmatter.updated).toBe("2026-10-02T09:00:00Z");
  });

  it("writes nothing when the block already holds that content", () => {
    const { env, state, id } = withExperiment();
    const first = must(editExperimentLiterature(state, id, "1. A.", env));
    const again = must(editExperimentLiterature(first.next, id, "1. A.", env));
    expect(again.steps).toEqual([]);
  });

  it("adds no block for empty content when there was none", () => {
    const { env, state, id } = withExperiment();
    const plan = must(editExperimentLiterature(state, id, "", env));
    expect(plan.steps).toEqual([]);
  });

  it("empties an existing block when nothing is cited any more", () => {
    const { env, state, id } = withExperiment();
    const first = must(editExperimentLiterature(state, id, "1. A.", env));
    const plan = must(editExperimentLiterature(first.next, id, "", env));
    const file = parsedExperiment(textOf(plan, EXPERIMENT_PATH));
    expect(file.body.literature).toBe("");
  });

  it("fails for an experiment that does not exist", () => {
    const { env, state } = withExperiment();
    expect(editExperimentLiterature(state, "nope", "x", env).ok).toBe(false);
  });
});

describe("editExperimentSection with a regenerated block", () => {
  it("saves the section and the block in one write", () => {
    const { env, state, id } = withExperiment();
    const plan = must(
      editExperimentSection(state, id, "methods", "See [@z:u:AAAA2222].", env, {
        literature: "1. A.",
      }),
    );
    expect(plan.steps).toHaveLength(1);
    const file = parsedExperiment(textOf(plan, EXPERIMENT_PATH));
    expect(file.body.sections[0]).toEqual({
      key: "methods",
      body: "See [@z:u:AAAA2222].",
    });
    expect(file.body.literature).toBe("1. A.");
  });

  it("still writes when only the block changes", () => {
    const { env, state, id } = withExperiment();
    const plan = must(
      editExperimentSection(state, id, "methods", "", env, {
        literature: "1. A.",
      }),
    );
    expect(plan.steps).toHaveLength(1);
  });

  it("refuses, writing nothing, when the block cannot be stored", () => {
    const { env, state, id } = withExperiment();
    const refused = editExperimentSection(state, id, "methods", "new", env, {
      literature: "<!-- literature:start -->",
    });
    expect(refused.ok).toBe(false);
  });

  it("adds no block for empty content when there was none", () => {
    const { env, state, id } = withExperiment();
    const plan = must(
      editExperimentSection(state, id, "methods", "text", env, {
        literature: "",
      }),
    );
    const file = parsedExperiment(textOf(plan, EXPERIMENT_PATH));
    expect(file.body.literature).toBeNull();
  });

  it("leaves the block alone when no literature is given", () => {
    const { env, state, id } = withExperiment();
    const withBlock = must(editExperimentLiterature(state, id, "1. A.", env));
    const plan = must(
      editExperimentSection(withBlock.next, id, "methods", "edit", env),
    );
    const file = parsedExperiment(textOf(plan, EXPERIMENT_PATH));
    expect(file.body.literature).toBe("1. A.");
  });
});
