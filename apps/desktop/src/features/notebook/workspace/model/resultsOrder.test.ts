import { describe, expect, it } from "vitest";
import { currentFirst, questionKeyOf, selectionOfKey } from "./resultsOrder";

/** The results list opens on the question being worked on. */

const groups = [
  { key: "Q-001.md" },
  { key: "Q-002.md" },
  { key: "unassigned" },
];

describe("currentFirst", () => {
  it("moves the current question to the front and keeps the rest in order", () => {
    expect(currentFirst(groups, "Q-002.md").map((g) => g.key)).toEqual([
      "Q-002.md",
      "Q-001.md",
      "unassigned",
    ]);
  });

  it("changes nothing when there is no current question or it is not there", () => {
    expect(currentFirst(groups, null)).toEqual(groups);
    expect(currentFirst(groups, "Q-009.md")).toEqual(groups);
  });

  it("does not change its input", () => {
    const before = JSON.stringify(groups);
    currentFirst(groups, "Q-002.md");
    expect(JSON.stringify(groups)).toBe(before);
  });
});

describe("questionKeyOf", () => {
  const arranged = {
    questions: [
      {
        question: { fileName: "Q-001.md" },
        experiments: [{ experiment: { folder: "EXP-001" } }],
      },
      {
        question: { fileName: "Q-002.md" },
        experiments: [{ experiment: { folder: "EXP-002" } }],
      },
    ],
    unassigned: [{ experiment: { folder: "EXP-009" } }],
  };

  it("is the question of a selected question or experiment", () => {
    expect(
      questionKeyOf(arranged, {
        kind: "question",
        fileName: "Q-002.md",
      }),
    ).toBe("Q-002.md");
    expect(
      questionKeyOf(arranged, { kind: "experiment", folder: "EXP-001" }),
    ).toBe("Q-001.md");
  });

  it("is Unassigned for an experiment no question holds, and nothing for no selection", () => {
    expect(
      questionKeyOf(arranged, { kind: "experiment", folder: "EXP-009" }),
    ).toBe("unassigned");
    expect(questionKeyOf(arranged, null)).toBeNull();
    expect(
      questionKeyOf(arranged, { kind: "experiment", folder: "EXP-777" }),
    ).toBeNull();
  });
});

describe("selectionOfKey", () => {
  it("reads the key a table row selects", () => {
    expect(selectionOfKey("question:Q-001.md")).toEqual({
      kind: "question",
      fileName: "Q-001.md",
    });
    expect(selectionOfKey("experiment:EXP-004")).toEqual({
      kind: "experiment",
      folder: "EXP-004",
    });
  });

  it("is nothing for no key or one it does not know", () => {
    expect(selectionOfKey(null)).toBeNull();
    expect(selectionOfKey("row:7")).toBeNull();
  });
});
