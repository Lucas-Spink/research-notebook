import { describe, expect, it } from "vitest";
import {
  at,
  deepFreeze,
  emptyState,
  must,
  testEnv,
  textOf,
} from "../../test/notebook-support";
import { parseProject } from "../files";
import {
  changeTableSettings,
  createExperiment,
  createQuestion,
  resetTableColumns,
  serialiseProject,
  type NotebookState,
} from "../index";

/** FR-TBL-04 and the collapse control of FR-TBL-02: layout is stored in project.yaml. */

const PROJECT = "_notebook/project.yaml";

function sample(appVersion = "0.2.0") {
  const env = testEnv({ appVersion });
  let state = emptyState(appVersion);
  state = must(createQuestion(state, { title: "First" }, env)).next;
  state = must(createQuestion(state, { title: "Second" }, env)).next;
  const first = at(state.questions, 0).file.frontmatter.id;
  const second = at(state.questions, 1).file.frontmatter.id;
  state = must(
    createExperiment(state, { questionId: first, title: "One" }, env),
  ).next;
  return { env, state, first, second };
}

const columns = (state: NotebookState) => state.project.table.columns;
const column = (state: NotebookState, key: string) =>
  columns(state).find((c) => c.key === key);

describe("changeTableSettings", () => {
  it("changes a column's width and nothing else, in one write of project.yaml", () => {
    const { env, state } = sample();
    const plan = must(
      changeTableSettings(state, { widths: { methods: 400 } }, env),
    );
    expect(plan.steps.map((s) => [s.kind, s.path])).toEqual([
      ["replace", PROJECT],
    ]);
    expect(column(plan.next, "methods")).toEqual({
      key: "methods",
      width: 400,
      hidden: false,
    });
    expect(columns(plan.next).map((c) => c.key)).toEqual(
      columns(state).map((c) => c.key),
    );
    expect(plan.next.project.order).toEqual(state.project.order);
    expect(plan.next.project.numbering).toEqual(state.project.numbering);
    expect(must(parseProject(textOf(plan, PROJECT)))).toEqual(
      plan.next.project,
    );
  });

  it("hides and shows columns", () => {
    const { env, state } = sample();
    const hidden = must(
      changeTableSettings(state, { hidden: { results: true } }, env),
    );
    expect(column(hidden.next, "results")?.hidden).toBe(true);
    const shown = must(
      changeTableSettings(hidden.next, { hidden: { results: false } }, env),
    );
    expect(column(shown.next, "results")?.hidden).toBe(false);
  });

  it("collapses and expands a question, listing it once", () => {
    const { env, state, first, second } = sample();
    const one = must(
      changeTableSettings(state, { collapsed: { [first]: true } }, env),
    );
    const two = must(
      changeTableSettings(
        one.next,
        { collapsed: { [second]: true, [first]: true } },
        env,
      ),
    );
    expect(two.next.project.table.collapsed_questions).toEqual([first, second]);
    const open = must(
      changeTableSettings(two.next, { collapsed: { [first]: false } }, env),
    );
    expect(open.next.project.table.collapsed_questions).toEqual([second]);
  });

  it("applies several changes in one write", () => {
    const { env, state, first } = sample();
    const plan = must(
      changeTableSettings(
        state,
        {
          widths: { methods: 300, results_notes: 310 },
          hidden: { literature: true },
          collapsed: { [first]: true },
        },
        env,
      ),
    );
    expect(plan.steps).toHaveLength(1);
    expect(column(plan.next, "methods")?.width).toBe(300);
    expect(column(plan.next, "results_notes")?.width).toBe(310);
    expect(column(plan.next, "literature")?.hidden).toBe(true);
    expect(plan.next.project.table.collapsed_questions).toEqual([first]);
  });

  it("writes nothing when nothing changes", () => {
    const { env, state, first } = sample();
    const width = column(state, "methods")?.width ?? 0;
    const plan = must(
      changeTableSettings(
        state,
        {
          widths: { methods: width },
          hidden: { methods: false },
          collapsed: { [first]: false },
        },
        env,
      ),
    );
    expect(plan.steps).toEqual([]);
    expect(plan.next).toBe(state);
    expect(must(changeTableSettings(state, {}, env)).steps).toEqual([]);
  });

  it("refuses a width that is not a whole number of at least 1, and changes nothing", () => {
    const { env, state } = sample();
    for (const width of [0, -5, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = changeTableSettings(
        state,
        { widths: { methods: width } },
        env,
      );
      expect(result.ok, String(width)).toBe(false);
      if (!result.ok)
        expect(result.error).toMatchObject({ kind: "invalid", field: "width" });
    }
    expect(
      changeTableSettings(state, { widths: { methods: 5000 } }, env).ok,
    ).toBe(true);
  });

  it("refuses a question that does not exist", () => {
    const { env, state } = sample();
    const result = changeTableSettings(
      state,
      { collapsed: { "01JAXZZZZZZZZZZZZZZZZZZZZZ": true } },
      env,
    );
    expect(result.ok ? null : result.error.kind).toBe("notFound");
  });

  it("carries unknown keys through, in the table and in each column", () => {
    const { env, state } = sample();
    const text = serialiseProject(state.project)
      .replace(
        "  collapsed_questions: []\n",
        '  collapsed_questions: []\n  x_table: "kept"\n',
      )
      .replace(
        '{key: "methods", width: 260, hidden: false}',
        '{key: "methods", width: 260, hidden: false, x_col: 1}',
      );
    const withUnknown = { ...state, project: must(parseProject(text)) };
    const plan = must(
      changeTableSettings(withUnknown, { widths: { methods: 270 } }, env),
    );
    const written = textOf(plan, PROJECT);
    expect(written).toContain('x_table: "kept"');
    expect(written).toContain(
      '{key: "methods", width: 270, hidden: false, x_col: 1}',
    );
  });

  it("records the running version as the last writer", () => {
    const { env, state } = sample();
    const older = {
      ...state,
      project: { ...state.project, last_written_by: "0.1.0" },
    };
    const plan = must(
      changeTableSettings(older, { hidden: { methods: true } }, env),
    );
    expect(plan.next.project.last_written_by).toBe("0.2.0");
  });

  it("does not change the state it was given", () => {
    const { env, state, first } = sample();
    deepFreeze(state);
    expect(
      changeTableSettings(
        state,
        { widths: { methods: 300 }, collapsed: { [first]: true } },
        env,
      ).ok,
    ).toBe(true);
  });
});

describe("resetTableColumns", () => {
  it("puts every column back to its default width, order and visibility, and keeps collapsed questions", () => {
    const { env, state, first } = sample();
    const changed = must(
      changeTableSettings(
        state,
        {
          widths: { methods: 999 },
          hidden: { results: true },
          collapsed: { [first]: true },
        },
        env,
      ),
    ).next;
    const plan = must(resetTableColumns(changed, env));
    expect(columns(plan.next)).toEqual(columns(state));
    expect(plan.next.project.table.collapsed_questions).toEqual([first]);
    expect(plan.steps.map((s) => s.path)).toEqual([PROJECT]);
  });

  it("writes nothing when the columns are already the defaults", () => {
    const { env, state } = sample();
    expect(must(resetTableColumns(state, env)).steps).toEqual([]);
  });
});
