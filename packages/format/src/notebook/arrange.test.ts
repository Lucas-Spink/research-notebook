import { describe, expect, it } from "vitest";
import { at, emptyState, must, testEnv } from "../../test/notebook-support";
import {
  arrangeNotebook,
  createExperiment,
  createQuestion,
  type LoadedExperiment,
  type NotebookState,
} from "../index";

/** FR-EXP-07 and FR-EXP-08, and the outcomes of format-v1.md section 5. */

function built() {
  const env = testEnv();
  let state = emptyState();
  for (const title of ["First", "Second"]) {
    state = must(createQuestion(state, { title }, env)).next;
  }
  const [first, second] = state.questions.map((q) => q.file.frontmatter.id);
  if (first === undefined || second === undefined)
    throw new Error("no questions");
  for (const [questionId, title] of [
    [first, "A"],
    [first, "B"],
    [second, "C"],
  ] as const) {
    state = must(createExperiment(state, { questionId, title }, env)).next;
  }
  return { env, state, first, second };
}

const refsOf = (items: readonly { experiment: LoadedExperiment }[]) =>
  items.map((item) => item.experiment.file.frontmatter.ref);

describe("arrangeNotebook: where each experiment is shown (FR-EXP-08)", () => {
  it("follows project.yaml for questions and for experiments within them", () => {
    const { state } = built();
    const arranged = arrangeNotebook(state);
    expect(
      arranged.questions.map((q) => q.question.file.frontmatter.ref),
    ).toEqual(["Q-001", "Q-002"]);
    expect(arranged.questions.map((q) => refsOf(q.experiments))).toEqual([
      ["EXP-001", "EXP-002"],
      ["EXP-003"],
    ]);
    expect(arranged.unassigned).toEqual([]);
    expect(arranged.problems).toEqual([]);
  });

  it("uses the order in project.yaml even when it differs from the refs", () => {
    const { state, first } = built();
    const [a, b] = state.experiments.map((e) => e.file.frontmatter.id);
    if (a === undefined || b === undefined) throw new Error("no experiments");
    const swapped: NotebookState = {
      ...state,
      project: {
        ...state.project,
        order: state.project.order.map((e) =>
          e.question === first ? { ...e, experiments: [b, a] } : e,
        ),
      },
    };
    expect(
      refsOf(at(arrangeNotebook(swapped).questions, 0).experiments),
    ).toEqual(["EXP-002", "EXP-001"]);
  });

  it("shows an experiment that is absent from the order at the end of its question", () => {
    const { state, first } = built();
    const [a] = state.experiments.map((e) => e.file.frontmatter.id);
    const trimmed: NotebookState = {
      ...state,
      project: {
        ...state.project,
        order: state.project.order.map((e) =>
          e.question === first
            ? { ...e, experiments: e.experiments.filter((id) => id !== a) }
            : e,
        ),
      },
    };
    const group = at(arrangeNotebook(trimmed).questions, 0);
    expect(refsOf(group.experiments)).toEqual(["EXP-002", "EXP-001"]);
    expect(group.experiments.map((e) => e.absentFromOrder)).toEqual([
      false,
      true,
    ]);
  });

  it("shows questions absent from the order after the listed ones, by ref", () => {
    const { state } = built();
    const unlisted: NotebookState = {
      ...state,
      project: { ...state.project, order: [] },
    };
    const arranged = arrangeNotebook(unlisted);
    expect(arranged.questions.map((q) => q.question.fileName)).toEqual([
      "Q-001.md",
      "Q-002.md",
    ]);
    expect(arranged.questions.flatMap((q) => refsOf(q.experiments))).toEqual([
      "EXP-001",
      "EXP-002",
      "EXP-003",
    ]);
  });

  it("shows experiments whose question is missing under Unassigned, by ref", () => {
    const { state, second } = built();
    const orphaned: NotebookState = {
      ...state,
      questions: state.questions.filter(
        (q) => q.file.frontmatter.id !== second,
      ),
    };
    const arranged = arrangeNotebook(orphaned);
    expect(refsOf(arranged.unassigned)).toEqual(["EXP-003"]);
    expect(arranged.problems).toContainEqual({
      kind: "orderNamesNoFile",
      entity: "question",
      id: second,
    });
  });

  it("puts an experiment under the question its own file names, whatever the order says", () => {
    const { state, first, second } = built();
    const [a] = state.experiments;
    if (a === undefined) throw new Error("no experiments");
    // The file says `second`, project.yaml still lists it under `first`: a move that stopped half-way.
    const halfMoved: NotebookState = {
      ...state,
      experiments: state.experiments.map((e) =>
        e === a
          ? {
              ...e,
              file: {
                ...e.file,
                frontmatter: { ...e.file.frontmatter, question: second },
              },
            }
          : e,
      ),
    };
    const arranged = arrangeNotebook(halfMoved);
    expect(arranged.questions.map((q) => refsOf(q.experiments))).toEqual([
      ["EXP-002"],
      ["EXP-003", "EXP-001"],
    ]);
    expect(arranged.problems).toContainEqual({
      kind: "orderMisplaced",
      experiment: a.file.frontmatter.id,
      listedUnder: first,
    });
  });

  it("reports an order entry that names no experiment file", () => {
    const { state, first } = built();
    const ghost = `01JAX${"7".repeat(21)}`;
    const withGhost: NotebookState = {
      ...state,
      project: {
        ...state.project,
        order: state.project.order.map((e) =>
          e.question === first
            ? { ...e, experiments: [ghost, ...e.experiments] }
            : e,
        ),
      },
    };
    expect(arrangeNotebook(withGhost).problems).toContainEqual({
      kind: "orderNamesNoFile",
      entity: "experiment",
      id: ghost,
    });
  });
});

describe("arrangeNotebook: what is wrong with the refs and files (FR-EXP-07)", () => {
  it("reports two experiments with the same ref, IDs staying authoritative", () => {
    const { state } = built();
    const [a, b] = state.experiments;
    if (a === undefined || b === undefined) throw new Error("no experiments");
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
    const problems = arrangeNotebook(clash).problems;
    expect(problems).toContainEqual({
      kind: "duplicateRef",
      entity: "experiment",
      ref: "EXP-001",
      ids: [a.file.frontmatter.id, b.file.frontmatter.id],
    });
    // Both are still shown: nothing is hidden or renumbered.
    expect(
      arrangeNotebook(clash).questions.flatMap((q) => q.experiments),
    ).toHaveLength(3);
  });

  it("reports two questions with the same ref", () => {
    const { state } = built();
    const [a, b] = state.questions;
    if (a === undefined || b === undefined) throw new Error("no questions");
    const clash: NotebookState = {
      ...state,
      questions: state.questions.map((q) =>
        q === b
          ? {
              ...q,
              file: {
                ...q.file,
                frontmatter: { ...q.file.frontmatter, ref: "Q-001" },
              },
            }
          : q,
      ),
    };
    expect(arrangeNotebook(clash).problems).toContainEqual({
      kind: "duplicateRef",
      entity: "question",
      ref: "Q-001",
      ids: [a.file.frontmatter.id, b.file.frontmatter.id],
    });
  });

  it("reports an experiment whose ref differs from its folder", () => {
    const { state } = built();
    const [a] = state.experiments;
    if (a === undefined) throw new Error("no experiments");
    const renamed: NotebookState = {
      ...state,
      experiments: state.experiments.map((e) =>
        e === a ? { ...e, folder: "EXP-9" } : e,
      ),
    };
    expect(arrangeNotebook(renamed).problems).toContainEqual({
      kind: "folderRefMismatch",
      folder: "EXP-9",
      ref: "EXP-001",
      id: a.file.frontmatter.id,
    });
  });

  it("marks the later of two files with one ID read-only, and reports both", () => {
    const { state } = built();
    const [a, b] = state.experiments;
    if (a === undefined || b === undefined) throw new Error("no experiments");
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
    const arranged = arrangeNotebook(twins);
    const shown = arranged.questions.flatMap((q) => q.experiments);
    expect(
      shown.filter((e) => e.readOnly).map((e) => e.experiment.folder),
    ).toEqual(["EXP-002"]);
    expect(arranged.problems).toContainEqual({
      kind: "duplicateId",
      entity: "experiment",
      id: a.file.frontmatter.id,
      locations: ["EXP-001", "EXP-002"],
    });
  });

  it("reports files that could not be read", () => {
    const { state } = built();
    const damaged: NotebookState = {
      ...state,
      unreadable: ["_notebook/questions/Q-009.md"],
    };
    expect(arrangeNotebook(damaged).problems).toContainEqual({
      kind: "unreadable",
      path: "_notebook/questions/Q-009.md",
    });
  });
});
