import {
  arrangeNotebook,
  createExperiment,
  type LoadedExperiment,
  type NotebookState,
} from "@research-notebook/format";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { sampleNotebook } from "./model/fakeApi";
import { NotebookView } from "./NotebookView";
import type { NotebookActions, NotebookModel } from "./useNotebook";

const actions: NotebookActions = {
  createQuestion: () => Promise.resolve(true),
  createExperiment: () => Promise.resolve(true),
  editQuestion: () => Promise.resolve(true),
  editExperiment: () => Promise.resolve(true),
  moveExperiment: () => Promise.resolve(true),
  removeExperiment: () => Promise.resolve(true),
  removeQuestion: () => Promise.resolve(true),
  refresh: () => Promise.resolve(),
  editExperimentSection: () => Promise.resolve({ ok: true }),
  changeSettings: () => undefined,
  resetColumns: () => undefined,
  setUnassignedCollapsed: () => undefined,
};

function model(
  state: NotebookState,
  overrides: Partial<NotebookModel> = {},
): NotebookModel {
  return {
    view: { status: "ready", loaded: { state, hashes: {} } },
    arranged: arrangeNotebook(state),
    table: state.project.table,
    unassignedCollapsed: false,
    busy: false,
    writable: true,
    notice: null,
    failure: null,
    actions,
    ...overrides,
  };
}

function render(notebook: NotebookModel, viewportHeight = 720): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <NotebookView notebook={notebook} viewportHeight={viewportHeight} />,
  );
  return container;
}

const rowsIn = (view: HTMLElement) => [
  ...view.querySelectorAll(".wtable__body > [role='row']"),
];
const text = (element: Element | null | undefined) =>
  element?.textContent ?? "";

function withSection(
  state: NotebookState,
  folder: string,
  key: "methods" | "results_notes" | "interpretation",
  body: string,
): NotebookState {
  const change = (e: LoadedExperiment): LoadedExperiment => ({
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
  return {
    ...state,
    experiments: state.experiments.map((e) =>
      e.folder === folder ? change(e) : e,
    ),
  };
}

describe("NotebookView: the table", () => {
  const { state, first } = sampleNotebook();

  it("is a table with a heading row, a header row per question and a row per experiment", () => {
    const view = render(model(state));
    const table = view.querySelector('[role="table"]');
    expect(table?.getAttribute("aria-rowcount")).toBe("5");
    const rows = rowsIn(view);
    expect(rows.map((r) => r.getAttribute("aria-rowindex"))).toEqual([
      "2",
      "3",
      "4",
      "5",
    ]);
    expect(text(rows[0])).toContain("Q-001");
    expect(text(rows[1])).toContain("EXP-001");
    expect(text(rows[2])).toContain("EXP-002");
    expect(text(rows[3])).toContain("Q-002");
  });

  it("gives each question a header with its title, its count and a collapse control", () => {
    const header = rowsIn(render(model(state)))[0];
    expect(text(header)).toContain("Q-001 First");
    expect(text(header)).toContain("2 experiments");
    const collapse = header?.querySelector("button[aria-expanded]");
    expect(collapse?.getAttribute("aria-expanded")).toBe("true");
    expect(collapse?.getAttribute("aria-label")).toBe("Collapse Q-001");
  });

  it("hides the experiments of a collapsed question and offers to expand it", () => {
    const collapsed = {
      ...state.project.table,
      collapsed_questions: [first],
    };
    const view = render(model(state, { table: collapsed }));
    const rows = rowsIn(view);
    expect(rows).toHaveLength(2);
    const button = rows[0]?.querySelector("button[aria-expanded]");
    expect(button?.getAttribute("aria-expanded")).toBe("false");
    expect(button?.getAttribute("aria-label")).toBe("Expand Q-001");
  });

  it("shows the column headings, each with a keyboard-reachable resize separator", () => {
    const view = render(model(state));
    const headings = [...view.querySelectorAll('[role="columnheader"]')].map(
      (h) => h.textContent,
    );
    expect(headings).toEqual([
      "Experiment",
      "Methods",
      "Results",
      "Results notes",
      "Interpretation",
      "Literature",
    ]);
    const separator = view.querySelector(
      '[aria-label="Resize Methods column"]',
    );
    expect(separator?.getAttribute("role")).toBe("separator");
    expect(separator?.getAttribute("tabindex")).toBe("0");
    expect(separator?.getAttribute("aria-valuenow")).toBe("260");
    expect(separator?.getAttribute("aria-orientation")).toBe("vertical");
  });

  it("leaves out a hidden column, and shows the Motivation in each question header instead of a column", () => {
    const table = {
      ...state.project.table,
      columns: state.project.table.columns.map((c) =>
        c.key === "results" ? { ...c, hidden: true } : c,
      ),
    };
    const view = render(model(state, { table }));
    const headings = [...view.querySelectorAll('[role="columnheader"]')].map(
      (h) => h.textContent,
    );
    expect(headings).not.toContain("Results");
    expect(headings).not.toContain("Motivation");
    expect(text(rowsIn(view)[0])).toContain("No motivation yet");
  });

  it("stops showing the Motivation when its column is hidden", () => {
    const table = {
      ...state.project.table,
      columns: state.project.table.columns.map((c) =>
        c.key === "motivation" ? { ...c, hidden: true } : c,
      ),
    };
    expect(text(rowsIn(render(model(state, { table })))[0])).not.toContain(
      "No motivation yet",
    );
  });

  it("shows read-only, line-clamped summaries in the cells, and no editors", () => {
    const edited = withSection(
      state,
      "EXP-001",
      "methods",
      "PCA on **variance-stabilised** counts.",
    );
    const view = render(model(edited));
    const row = rowsIn(view)[1];
    const clamp = row?.querySelector(".wtable__clamp");
    expect(clamp?.textContent).toBe("PCA on variance-stabilised counts.");
    expect(clamp?.getAttribute("title")).toBe(
      "PCA on variance-stabilised counts.",
    );
    expect(text(row)).toContain("None yet");
    expect(
      view.querySelector(".wtable textarea, .wtable [contenteditable]"),
    ).toBeNull();
    expect(view.querySelector(".wtable input")).toBeNull();
  });

  it("says a cell is empty in words as well as with a dash", () => {
    const row = rowsIn(render(model(state)))[1];
    expect(text(row?.querySelector(".wtable__empty"))).toContain("Empty");
  });

  it("names the experiment every row's select button belongs to", () => {
    const view = render(model(state));
    const labels = [...view.querySelectorAll(".wtable button")].map((b) =>
      b.getAttribute("aria-label"),
    );
    expect(labels).toEqual(
      expect.arrayContaining([
        "Select EXP-001",
        "Select Q-001",
        "Collapse Q-001",
      ]),
    );
  });

  it("shows status in words, not only in a style", () => {
    const row = rowsIn(render(model(state)))[1];
    expect(text(row?.querySelector(".wtable__status"))).toBe("Planned");
  });

  it("can be scrolled with the keyboard", () => {
    const region = render(model(state)).querySelector(".wtable");
    expect(region?.getAttribute("tabindex")).toBe("0");
    expect(region?.getAttribute("role")).toBe("region");
    expect(region?.getAttribute("aria-label")).toBeTruthy();
  });

  it("shows experiments whose question is missing under Unassigned, with its own collapse control", () => {
    const orphaned: NotebookState = {
      ...state,
      questions: state.questions.filter((q) => q.file.frontmatter.id !== first),
    };
    const view = render(model(orphaned));
    const header = rowsIn(view).find((r) => text(r).includes("Unassigned"));
    expect(header?.querySelector("button[aria-expanded]")).not.toBeNull();
    expect(text(header)).toContain("2 experiments");
  });
});

describe("NotebookView: only the rows in view are drawn (FR-TBL-10)", () => {
  it("draws a window of a 500-experiment project, not all of it", () => {
    const sample = sampleNotebook();
    let state = sample.state;
    for (let i = 0; i < 500; i += 1) {
      const planned = createExperiment(
        state,
        { questionId: sample.first, title: `Experiment ${i}` },
        sample.env,
      );
      if (!planned.ok) throw new Error(JSON.stringify(planned.error));
      state = planned.value.next;
    }
    const view = render(model(state), 720);
    const drawn = rowsIn(view).length;
    expect(drawn).toBeGreaterThan(5);
    expect(drawn).toBeLessThan(40);
    // The table still says how big it is, so a screen reader can tell.
    const table = view.querySelector('[role="table"]');
    expect(Number(table?.getAttribute("aria-rowcount"))).toBeGreaterThan(500);
    expect(text(rowsIn(view)[0])).toContain("502 experiments");
  });
});

describe("NotebookView: controls", () => {
  const { state } = sampleNotebook();

  it("has a labelled filter, status filter, sort, direction and columns control", () => {
    const view = render(model(state));
    const toolbar = view.querySelector('[role="search"]');
    for (const label of toolbar?.querySelectorAll("label") ?? []) {
      const id = label.getAttribute("for") ?? "";
      expect(
        toolbar?.querySelector(`#${CSS.escape(id)}`),
        label.textContent,
      ).not.toBeNull();
    }
    expect(text(toolbar)).toContain("Filter experiments");
    expect(text(toolbar)).toContain("Sort within each question");
    const direction = toolbar?.querySelector(
      'button[aria-label="Change sort direction"]',
    );
    expect(direction?.hasAttribute("disabled")).toBe(true);
    const columns = [...(toolbar?.querySelectorAll("button") ?? [])].find(
      (b) => b.textContent === "Columns",
    );
    expect(columns?.getAttribute("aria-expanded")).toBe("false");
  });

  it("offers, below the table, what to do with a selection, and to add a question", () => {
    const view = render(model(state));
    const details = view.querySelector(".notebook__details");
    expect(text(details)).toContain("Select an experiment or a question");
    expect(text(view)).toContain("New question");
  });

  it("keeps the table usable, and the forms off, in a read-only project", () => {
    const view = render(model(state, { writable: false }));
    expect(text(view)).toContain("read-only");
    expect(view.querySelector(".wtable button")?.hasAttribute("disabled")).toBe(
      false,
    );
    const form = view.querySelector(".notebook__new input");
    expect(form?.hasAttribute("disabled")).toBe(true);
  });

  it("says so while an operation is under way, and turns the forms off", () => {
    const view = render(model(state, { busy: true }));
    expect(text(view)).toContain("Working…");
    expect(
      view.querySelector(".notebook__new input")?.hasAttribute("disabled"),
    ).toBe(true);
  });

  it("lists the problems found, in words, and flags the ref where it is shown", () => {
    const [, b] = state.experiments;
    const clash: NotebookState = {
      ...state,
      experiments: state.experiments.map((e) =>
        e === b
          ? {
              ...e,
              file: {
                ...e.file,
                frontmatter: { ...e.file.frontmatter, ref: "EXP-001" },
              },
            }
          : e,
      ),
    };
    const view = render(model(clash));
    expect(text(view.querySelector(".notebook__problems"))).toContain(
      "share the ref EXP-001",
    );
    expect(text(view)).toContain("Shares its ref");
  });

  it("shows loading, and a failure without any table", () => {
    const loading = render({
      ...model(state),
      view: { status: "loading" },
      arranged: null,
      table: null,
    });
    expect(loading.textContent).toContain("Loading");
    expect(loading.querySelector('[role="table"]')).toBeNull();
    const failed = render({
      ...model(state),
      view: { status: "failed", reason: "projectFile" },
      arranged: null,
      table: null,
      failure: "The project file could not be read.",
    });
    expect(failed.textContent).toContain("could not be read");
    expect(failed.querySelector('[role="table"]')).toBeNull();
  });

  it("says when there are no questions yet, and still offers to add one", () => {
    const empty: NotebookState = { ...state, questions: [], experiments: [] };
    const view = render(model(empty));
    expect(text(view)).toContain("no questions yet");
    expect(text(view)).toContain("New question");
  });
});
