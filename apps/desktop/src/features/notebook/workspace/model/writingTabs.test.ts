import { describe, expect, it } from "vitest";
import {
  UNASSIGNED_TAB,
  chooseExperiment,
  chooseQuestion,
  initialWriting,
  reconcile,
  tabsOf,
  type WritingTabs,
} from "./writingTabs";

/**
 * The writing panel beside the canvas has a row of question tabs and, under it,
 * a row of that question's experiments. Switching question comes back to the
 * experiment last used in it.
 */

type Item = { folder: string; ref: string; title: string; readOnly?: boolean };
type Group = { key: string; ref: string; title: string; items: Item[] };

const arranged = (groups: Group[], unassigned: Item[] = []) => ({
  questions: groups.map((g) => ({
    question: {
      fileName: `${g.key}.md`,
      file: { frontmatter: { ref: g.ref, title: g.title } },
    },
    readOnly: false,
    experiments: g.items.map((i) => item(i)),
  })),
  unassigned: unassigned.map((i) => item(i)),
  problems: [],
});
const item = (i: Item) => ({
  experiment: {
    folder: i.folder,
    file: { frontmatter: { ref: i.ref, title: i.title } },
  },
  readOnly: i.readOnly ?? false,
  absentFromOrder: false,
});

const two = () =>
  tabsOf(
    arranged(
      [
        {
          key: "Q-001",
          ref: "Q-001",
          title: "First",
          items: [
            { folder: "EXP-001", ref: "EXP-001", title: "One" },
            { folder: "EXP-002", ref: "EXP-002", title: "Two" },
          ],
        },
        {
          key: "Q-002",
          ref: "Q-002",
          title: "Second",
          items: [{ folder: "EXP-003", ref: "EXP-003", title: "Three" }],
        },
      ],
      [{ folder: "EXP-009", ref: "EXP-009", title: "Loose" }],
    ),
  );

describe("tabsOf", () => {
  it("has a tab for each question, in order, and Unassigned last when there are loose experiments", () => {
    expect(two().map((t) => t.label)).toEqual([
      "Q-001 First",
      "Q-002 Second",
      "Unassigned",
    ]);
    expect(two().at(-1)?.key).toBe(UNASSIGNED_TAB);
  });

  it("lists each question's experiments by ref and title", () => {
    expect(two()[0]?.experiments).toEqual([
      { folder: "EXP-001", label: "EXP-001 One", readOnly: false },
      { folder: "EXP-002", label: "EXP-002 Two", readOnly: false },
    ]);
  });

  it("leaves out Unassigned when nothing is", () => {
    const tabs = tabsOf(arranged([]));
    expect(tabs).toEqual([]);
  });

  it("keeps a question with no experiments, so its tab is still there", () => {
    const tabs = tabsOf(
      arranged([{ key: "Q-001", ref: "Q-001", title: "Empty", items: [] }]),
    );
    expect(tabs[0]?.experiments).toEqual([]);
  });
});

describe("initialWriting and reconcile", () => {
  it("starts on the first question and its first experiment", () => {
    expect(initialWriting(two())).toMatchObject({
      question: "Q-001.md",
      experiment: "EXP-001",
    });
  });

  it("starts on nothing for a project with nothing", () => {
    expect(initialWriting([])).toMatchObject({
      question: null,
      experiment: null,
    });
  });

  it("keeps a choice that is still there", () => {
    const state: WritingTabs = {
      question: "Q-002.md",
      experiment: "EXP-003",
      last: {},
    };
    expect(reconcile(state, two())).toBe(state);
  });

  it("moves on when the experiment is gone, to another in the same question, else the first", () => {
    const state: WritingTabs = {
      question: "Q-001.md",
      experiment: "EXP-777",
      last: {},
    };
    expect(reconcile(state, two())).toMatchObject({
      question: "Q-001.md",
      experiment: "EXP-001",
    });
    const gone: WritingTabs = {
      question: "Q-777.md",
      experiment: "EXP-777",
      last: {},
    };
    expect(reconcile(gone, two())).toMatchObject({
      question: "Q-001.md",
      experiment: "EXP-001",
    });
  });

  it("forgets what it remembered about an experiment that is gone", () => {
    const state: WritingTabs = {
      question: "Q-001.md",
      experiment: "EXP-001",
      last: { "Q-001.md": "EXP-777", "Q-002.md": "EXP-003" },
    };
    expect(reconcile(state, two()).last).toEqual({ "Q-002.md": "EXP-003" });
  });
});

describe("chooseQuestion", () => {
  it("opens the question at the experiment last used in it", () => {
    let state = initialWriting(two());
    state = chooseExperiment(state, "EXP-002", two());
    state = chooseQuestion(state, "Q-002.md", two());
    expect(state).toMatchObject({
      question: "Q-002.md",
      experiment: "EXP-003",
    });
    state = chooseQuestion(state, "Q-001.md", two());
    expect(state).toMatchObject({
      question: "Q-001.md",
      experiment: "EXP-002",
    });
  });

  it("opens the first experiment of a question not visited yet", () => {
    const state = chooseQuestion(initialWriting(two()), "Q-002.md", two());
    expect(state.experiment).toBe("EXP-003");
  });

  it("has no experiment for a question that has none", () => {
    const tabs = tabsOf(
      arranged([
        { key: "Q-001", ref: "Q-001", title: "A", items: [] },
        {
          key: "Q-002",
          ref: "Q-002",
          title: "B",
          items: [{ folder: "EXP-003", ref: "EXP-003", title: "C" }],
        },
      ]),
    );
    expect(
      chooseQuestion(initialWriting(tabs), "Q-001.md", tabs).experiment,
    ).toBeNull();
  });

  it("ignores a question that is not there", () => {
    const state = initialWriting(two());
    expect(chooseQuestion(state, "Q-777.md", two())).toBe(state);
  });
});

describe("chooseExperiment", () => {
  it("shows the question the experiment is in, and remembers it there", () => {
    const state = chooseExperiment(initialWriting(two()), "EXP-003", two());
    expect(state).toMatchObject({
      question: "Q-002.md",
      experiment: "EXP-003",
      last: { "Q-002.md": "EXP-003" },
    });
  });

  it("finds an unassigned experiment under the Unassigned tab", () => {
    const state = chooseExperiment(initialWriting(two()), "EXP-009", two());
    expect(state).toMatchObject({
      question: UNASSIGNED_TAB,
      experiment: "EXP-009",
    });
  });

  it("ignores an experiment that is not there", () => {
    const state = initialWriting(two());
    expect(chooseExperiment(state, "EXP-777", two())).toBe(state);
  });

  it("does not change its input", () => {
    const state = initialWriting(two());
    const before = JSON.stringify(state);
    chooseExperiment(state, "EXP-003", two());
    expect(JSON.stringify(state)).toBe(before);
  });
});
