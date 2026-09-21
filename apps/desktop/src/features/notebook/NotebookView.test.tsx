import { arrangeNotebook, type NotebookState } from "@research-notebook/format";
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
};

function model(
  state: NotebookState,
  overrides: Partial<NotebookModel> = {},
): NotebookModel {
  return {
    view: { status: "ready", loaded: { state, hashes: {} } },
    arranged: arrangeNotebook(state),
    busy: false,
    writable: true,
    notice: null,
    failure: null,
    actions,
    ...overrides,
  };
}

function render(notebook: NotebookModel): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <NotebookView notebook={notebook} />,
  );
  return container;
}

const labels = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].map(
    (b) => b.getAttribute("aria-label") ?? b.textContent,
  );

describe("NotebookView", () => {
  const { state, first } = sampleNotebook();

  it("shows each question with its ref and title, and its experiments under it", () => {
    const view = render(model(state));
    const sections = [...view.querySelectorAll(".notebook__question")];
    expect(sections).toHaveLength(2);
    expect(sections[0]?.querySelector("h4")?.textContent).toBe("Q-001 First");
    expect(sections[0]?.textContent).toContain("EXP-001");
    expect(sections[0]?.textContent).toContain("EXP-002");
    expect(sections[1]?.textContent).toContain(
      "No experiments in this question yet.",
    );
  });

  it("offers to add a question and an experiment to each question, with labelled fields", () => {
    const view = render(model(state));
    for (const label of view.querySelectorAll("label")) {
      const target = label.getAttribute("for");
      expect(target, label.textContent).not.toBeNull();
      expect(view.querySelector(`#${CSS.escape(target ?? "")}`)).not.toBeNull();
    }
    expect(view.textContent).toContain("New question");
    expect(view.textContent).toContain("New experiment in Q-001");
    expect(view.textContent).toContain("New experiment in Q-002");
  });

  it("names the item every action belongs to", () => {
    const view = render(model(state));
    expect(labels(view)).toEqual(
      expect.arrayContaining([
        "Edit Q-001",
        "Delete Q-001",
        "Edit EXP-001",
        "Move EXP-001",
        "Delete EXP-001",
      ]),
    );
  });

  it("disables every field and button, and says why, in a read-only project", () => {
    const view = render(model(state, { writable: false }));
    expect(view.textContent).toContain("read-only");
    const controls = [...view.querySelectorAll("input, select, button")];
    // Refresh only reads, so it stays available.
    const enabled = controls.filter(
      (c) => !(c as HTMLButtonElement).disabled && c.textContent !== "Refresh",
    );
    expect(enabled.map((c) => c.outerHTML)).toEqual([]);
  });

  it("disables the controls while an operation is under way and says so", () => {
    const view = render(model(state, { busy: true }));
    expect(view.textContent).toContain("Working…");
    expect([...view.querySelectorAll("button")].every((b) => b.disabled)).toBe(
      true,
    );
  });

  it("shows experiments whose question is missing under Unassigned, without question actions", () => {
    const orphaned: NotebookState = {
      ...state,
      questions: state.questions.filter((q) => q.file.frontmatter.id !== first),
    };
    const view = render(model(orphaned));
    const unassigned = [...view.querySelectorAll("section")].find(
      (s) => s.querySelector("h4")?.textContent === "Unassigned",
    );
    expect(unassigned?.textContent).toContain("EXP-001");
    expect(unassigned?.textContent).toContain("EXP-002");
    expect(unassigned?.textContent).not.toContain("New experiment");
    // They can be moved to the question that is left.
    expect(unassigned?.textContent).toContain("Q-002 Second");
  });

  it("lists the problems found, in words", () => {
    const [a, b] = state.experiments;
    if (a === undefined || b === undefined) throw new Error("sample");
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
    expect(view.querySelector(".notebook__problems")?.textContent).toContain(
      "share the ref EXP-001",
    );
    expect(view.textContent).toContain("Shares its ref");
  });

  it("marks an experiment that is not in the saved order", () => {
    const unlisted: NotebookState = {
      ...state,
      project: { ...state.project, order: [] },
    };
    expect(render(model(unlisted)).textContent).toContain(
      "Not in the saved order",
    );
  });

  it("gives no actions on an experiment that shares its ID with an earlier file", () => {
    const [a, b] = state.experiments;
    if (a === undefined || b === undefined) throw new Error("sample");
    const twins: NotebookState = {
      ...state,
      experiments: state.experiments.map((e) =>
        e === b
          ? {
              ...e,
              file: {
                ...e.file,
                frontmatter: {
                  ...e.file.frontmatter,
                  id: a.file.frontmatter.id,
                },
              },
            }
          : e,
      ),
    };
    const view = labels(render(model(twins)));
    expect(view).toContain("Edit EXP-001");
    expect(view).not.toContain("Edit EXP-002");
  });

  it("shows loading, and a failure without any list", () => {
    const loading = render({
      ...model(state),
      view: { status: "loading" },
      arranged: null,
    });
    expect(loading.textContent).toContain("Loading");
    expect(loading.querySelectorAll("button")).toHaveLength(0);
    const failed = render({
      ...model(state),
      view: { status: "failed", reason: "projectFile" },
      arranged: null,
      failure: "The project file could not be read.",
    });
    expect(failed.textContent).toContain("could not be read");
    expect(failed.querySelectorAll(".notebook__question")).toHaveLength(0);
  });

  it("says when there are no questions yet", () => {
    const empty: NotebookState = { ...state, questions: [], experiments: [] };
    expect(render(model(empty)).textContent).toContain("no questions yet");
  });
});
