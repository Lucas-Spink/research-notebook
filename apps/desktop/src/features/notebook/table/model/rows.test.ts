import type {
  LoadedExperiment,
  NotebookState,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { arrangeNotebook } from "@research-notebook/format";
import { sampleNotebook } from "../../model/fakeApi";
import {
  UNASSIGNED_KEY,
  buildRows,
  type ExperimentRow,
  type FilterState,
  type HeaderRow,
  type SortColumn,
  type SortState,
  type TableRow,
} from "./rows";

/** FR-TBL-01, 02, 03, 05: what the table shows, and in what order. */

const NO_FILTER: FilterState = { text: "", status: "all" };

function rowsOf(
  state: NotebookState,
  options: {
    collapsed?: string[];
    sort?: SortState;
    filter?: FilterState;
  } = {},
): TableRow[] {
  return buildRows(arrangeNotebook(state), {
    collapsed: new Set(options.collapsed ?? []),
    sort: options.sort ?? null,
    filter: options.filter ?? NO_FILTER,
  });
}

const headers = (rows: TableRow[]) =>
  rows.filter((r): r is HeaderRow => r.kind === "header");
const experiments = (rows: TableRow[]) =>
  rows.filter((r): r is ExperimentRow => r.kind === "experiment");
const refs = (rows: TableRow[]) =>
  experiments(rows).map((r) => r.item.experiment.file.frontmatter.ref);

/** Edits one experiment of a state by its folder. */
function edited(
  state: NotebookState,
  folder: string,
  change: (e: LoadedExperiment) => LoadedExperiment,
): NotebookState {
  return {
    ...state,
    experiments: state.experiments.map((e) =>
      e.folder === folder ? change(e) : e,
    ),
  };
}

const withFront =
  (values: Record<string, unknown>) => (e: LoadedExperiment) => ({
    ...e,
    file: { ...e.file, frontmatter: { ...e.file.frontmatter, ...values } },
  });

const withSection =
  (key: "methods" | "results_notes" | "interpretation", body: string) =>
  (e: LoadedExperiment): LoadedExperiment => ({
    ...e,
    file: {
      ...e.file,
      body: {
        ...e.file.body,
        sections: e.file.body.sections.map((s) =>
          s.key === key ? { ...s, body } : s,
        ),
      },
    },
  });

describe("buildRows: grouping and order", () => {
  const { state } = sampleNotebook();

  it("puts a header row for each question, then that question's experiments, in project order", () => {
    const rows = rowsOf(state);
    expect(rows.map((r) => r.kind)).toEqual([
      "header",
      "experiment",
      "experiment",
      "header",
    ]);
    expect(headers(rows).map((h) => h.ref)).toEqual(["Q-001", "Q-002"]);
    expect(refs(rows)).toEqual(["EXP-001", "EXP-002"]);
  });

  it("gives every row a key that is unique and stays with the thing it shows", () => {
    const keys = rowsOf(state).map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toEqual(rowsOf(state).map((r) => r.key));
  });

  it("counts a question's experiments in its header", () => {
    const [one, two] = headers(rowsOf(state));
    expect([one?.shown, one?.total, one?.filtered]).toEqual([2, 2, false]);
    expect([two?.shown, two?.total]).toEqual([0, 0]);
  });

  it("shows the Motivation as a plain summary in the header", () => {
    const withMotivation: NotebookState = {
      ...state,
      questions: state.questions.map((q, i) =>
        i === 0
          ? {
              ...q,
              file: {
                ...q.file,
                body: "Why do **batch** effects [matter](https://x)?",
              },
            }
          : q,
      ),
    };
    expect(headers(rowsOf(withMotivation))[0]?.motivation).toBe(
      "Why do batch effects matter?",
    );
  });

  it("shows experiments whose question is missing last, under an Unassigned header", () => {
    const orphaned: NotebookState = {
      ...state,
      questions: state.questions.slice(1),
    };
    const rows = rowsOf(orphaned);
    const last = headers(rows).at(-1);
    expect(last).toMatchObject({
      key: UNASSIGNED_KEY,
      questionId: null,
      ref: null,
      total: 2,
    });
    expect(refs(rows)).toEqual(["EXP-001", "EXP-002"]);
    expect(rows.at(-1)?.kind).toBe("experiment");
  });

  it("hides the experiments of a collapsed question and keeps its header", () => {
    const first = state.questions[0]?.file.frontmatter.id ?? "";
    const rows = rowsOf(state, { collapsed: [first] });
    expect(refs(rows)).toEqual([]);
    expect(headers(rows)[0]).toMatchObject({
      collapsed: true,
      shown: 2,
      total: 2,
    });
  });

  it("collapses Unassigned by its own key", () => {
    const orphaned: NotebookState = {
      ...state,
      questions: state.questions.slice(1),
    };
    const rows = rowsOf(orphaned, { collapsed: [UNASSIGNED_KEY] });
    expect(refs(rows)).toEqual([]);
    expect(headers(rows).at(-1)?.collapsed).toBe(true);
  });

  it("marks a read-only header and row, so no action is offered", () => {
    const [a, b] = state.experiments;
    const twin: NotebookState = {
      ...state,
      experiments: state.experiments.map((e) =>
        e === b ? withFront({ id: a?.file.frontmatter.id })(e) : e,
      ),
    };
    expect(experiments(rowsOf(twin)).map((r) => r.item.readOnly)).toEqual([
      false,
      true,
    ]);
  });
});

describe("buildRows: cell summaries (FR-TBL-05)", () => {
  const { state } = sampleNotebook();

  /** Flattens a summary's parts back to plain text, for assertions that do
   * not care whether a bit of it is a reference chip. */
  const flat = (
    parts: readonly { kind: string; text?: string; label?: string }[],
  ) => parts.map((p) => (p.kind === "ref" ? p.label : p.text)).join("");

  it("summarises each section as plain text", () => {
    const s = edited(
      edited(
        state,
        "EXP-001",
        withSection(
          "methods",
          "PCA on **variance-stabilised** counts [@z:u:7XK2PQ9M].",
        ),
      ),
      "EXP-001",
      withSection("interpretation", "- PC1 separates\n- by [treatment](t.png)"),
    );
    const first = experiments(rowsOf(s))[0];
    expect(flat(first?.summaries.methods ?? [])).toBe(
      "PCA on variance-stabilised counts [@z:u:7XK2PQ9M].",
    );
    expect(flat(first?.summaries.interpretation ?? [])).toBe(
      "PC1 separates by treatment",
    );
    expect(first?.summaries.results_notes).toEqual([]);
  });

  it("keeps an artefact reference as a ref part, not flattened text", () => {
    const s = edited(
      state,
      "EXP-001",
      withSection(
        "methods",
        'See [PCA by treatment](evidence/pca.v2.pdf "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v2").',
      ),
    );
    expect(experiments(rowsOf(s))[0]?.summaries.methods).toEqual([
      { kind: "text", text: "See " },
      {
        kind: "ref",
        label: "PCA by treatment",
        ulid: "01JAXR5D8K2M4N6P8Q0R2S4T6V",
        version: 2,
      },
      { kind: "text", text: "." },
    ]);
  });

  it("summarises the literature block without its heading marker", () => {
    const s = edited(state, "EXP-001", (e) => ({
      ...e,
      file: {
        ...e.file,
        body: {
          ...e.file.body,
          literature: "## Literature\n\n1. Love et al. (2014).",
        },
      },
    }));
    expect(flat(experiments(rowsOf(s))[0]?.summaries.literature ?? [])).toBe(
      "Literature Love et al. (2014).",
    );
  });

  it("bounds each summary so a huge section does not make a huge cell", () => {
    const s = edited(
      state,
      "EXP-001",
      withSection("methods", "word ".repeat(10_000)),
    );
    const summary = flat(experiments(rowsOf(s))[0]?.summaries.methods ?? []);
    expect([...summary].length).toBeLessThanOrEqual(240);
    expect(summary.endsWith("…")).toBe(true);
  });
});

describe("buildRows: filtering within questions (FR-TBL-03)", () => {
  const { state } = sampleNotebook();
  const running = edited(
    state,
    "EXP-002",
    withFront({ status: "running", title: "Batch PCA" }),
  );

  it("filters by status, and shows n of m in the header", () => {
    const rows = rowsOf(running, { filter: { text: "", status: "running" } });
    expect(refs(rows)).toEqual(["EXP-002"]);
    expect(headers(rows)[0]).toMatchObject({
      shown: 1,
      total: 2,
      filtered: true,
    });
  });

  it("filters by text in the ref, the title or any section, ignoring case", () => {
    expect(
      refs(rowsOf(running, { filter: { text: "batch", status: "all" } })),
    ).toEqual(["EXP-002"]);
    expect(
      refs(rowsOf(running, { filter: { text: "exp-001", status: "all" } })),
    ).toEqual(["EXP-001"]);
    const withText = edited(
      state,
      "EXP-001",
      withSection("interpretation", "Strong Treatment effect"),
    );
    expect(
      refs(rowsOf(withText, { filter: { text: "treatment", status: "all" } })),
    ).toEqual(["EXP-001"]);
  });

  it("finds text that a summary would have cut off", () => {
    const long = edited(
      state,
      "EXP-001",
      withSection("methods", `${"filler ".repeat(200)}needle`),
    );
    expect(
      refs(rowsOf(long, { filter: { text: "needle", status: "all" } })),
    ).toEqual(["EXP-001"]);
  });

  it("applies text and status together", () => {
    const rows = rowsOf(running, {
      filter: { text: "batch", status: "planned" },
    });
    expect(refs(rows)).toEqual([]);
  });

  it("keeps the header of a question with no match, and says nothing matched", () => {
    const rows = rowsOf(running, { filter: { text: "zzz", status: "all" } });
    expect(headers(rows).map((h) => [h.shown, h.total, h.filtered])).toEqual([
      [0, 2, true],
      [0, 0, true],
    ]);
    expect(rows.filter((r) => r.kind === "empty")).toHaveLength(1);
  });

  it("filters each question on its own", () => {
    const sample = sampleNotebook();
    // EXP-002 ("Two") moves to the second question, so each question holds one.
    const split = edited(
      sample.state,
      "EXP-002",
      withFront({ question: sample.second }),
    );
    const rows = rowsOf(split, { filter: { text: "two", status: "all" } });
    expect(headers(rows).map((h) => [h.ref, h.shown, h.total])).toEqual([
      ["Q-001", 0, 1],
      ["Q-002", 1, 1],
    ]);
    expect(refs(rows)).toEqual(["EXP-002"]);
  });
});

describe("buildRows: sorting within questions (FR-TBL-03)", () => {
  const { state } = sampleNotebook();

  const asc = (column: SortColumn): SortState => ({
    column,
    direction: "asc",
  });

  it("sorts by ref as a number, not as text", () => {
    const big = edited(
      edited(state, "EXP-001", withFront({ ref: "EXP-010" })),
      "EXP-002",
      withFront({ ref: "EXP-002" }),
    );
    expect(refs(rowsOf(big, { sort: asc("ref") }))).toEqual([
      "EXP-002",
      "EXP-010",
    ]);
    expect(
      refs(rowsOf(big, { sort: { column: "ref", direction: "desc" } })),
    ).toEqual(["EXP-010", "EXP-002"]);
  });

  it("sorts by title, ignoring case and reading digits as numbers", () => {
    const s = edited(
      edited(state, "EXP-001", withFront({ title: "run 10" })),
      "EXP-002",
      withFront({ title: "Run 9" }),
    );
    expect(refs(rowsOf(s, { sort: asc("title") }))).toEqual([
      "EXP-002",
      "EXP-001",
    ]);
  });

  it("sorts by status in the order of a study, not the alphabet", () => {
    const s = edited(
      edited(state, "EXP-001", withFront({ status: "complete" })),
      "EXP-002",
      withFront({ status: "running" }),
    );
    expect(refs(rowsOf(s, { sort: asc("status") }))).toEqual([
      "EXP-002",
      "EXP-001",
    ]);
    expect(
      refs(rowsOf(s, { sort: { column: "status", direction: "desc" } })),
    ).toEqual(["EXP-001", "EXP-002"]);
  });

  it("puts experiments with no date last, whichever way it sorts", () => {
    const s = edited(
      edited(state, "EXP-001", withFront({ started: undefined })),
      "EXP-002",
      withFront({ started: "2026-09-01" }),
    );
    expect(refs(rowsOf(s, { sort: asc("started") }))).toEqual([
      "EXP-002",
      "EXP-001",
    ]);
    expect(
      refs(rowsOf(s, { sort: { column: "started", direction: "desc" } })),
    ).toEqual(["EXP-002", "EXP-001"]);
  });

  it("keeps a stable order for equal values", () => {
    const s = edited(
      edited(state, "EXP-001", withFront({ status: "running" })),
      "EXP-002",
      withFront({ status: "running" }),
    );
    expect(refs(rowsOf(s, { sort: asc("status") }))).toEqual([
      "EXP-001",
      "EXP-002",
    ]);
  });

  it("never moves an experiment out of its question", () => {
    const rows = rowsOf(state, { sort: { column: "ref", direction: "desc" } });
    expect(rows.map((r) => r.kind)).toEqual([
      "header",
      "experiment",
      "experiment",
      "header",
    ]);
    expect(refs(rows)).toEqual(["EXP-002", "EXP-001"]);
  });

  it("goes back to the order in project.yaml when the sort is cleared", () => {
    const listed = refs(rowsOf(state));
    expect(refs(rowsOf(state, { sort: null }))).toEqual(listed);
    expect(
      refs(rowsOf(state, { sort: { column: "ref", direction: "desc" } })),
    ).not.toEqual(listed);
  });

  it("does not change the arrangement it was given", () => {
    const arranged = arrangeNotebook(state);
    const before = arranged.questions[0]?.experiments.map(
      (e) => e.experiment.folder,
    );
    buildRows(arranged, {
      collapsed: new Set(),
      sort: { column: "ref", direction: "desc" },
      filter: NO_FILTER,
    });
    expect(
      arranged.questions[0]?.experiments.map((e) => e.experiment.folder),
    ).toEqual(before);
  });
});
