import { describe, expect, it } from "vitest";
import { questionsOf, reconcileQuestion } from "./canvasQuestions";

/** The canvas has a tab for each question; a question's id names its canvas file. */

const arranged = {
  questions: [
    {
      question: {
        fileName: "Q-001.md",
        file: {
          frontmatter: {
            id: "01JAXQ0000000000000000000A",
            ref: "Q-001",
            title: "First",
          },
        },
      },
    },
    {
      question: {
        fileName: "Q-002.md",
        file: {
          frontmatter: {
            id: "01JAXQ0000000000000000000B",
            ref: "Q-002",
            title: "Second",
          },
        },
      },
    },
  ],
};

describe("questionsOf", () => {
  it("has a tab for each question, in order, keyed by its file and carrying its id", () => {
    expect(questionsOf(arranged)).toEqual([
      {
        key: "Q-001.md",
        id: "01JAXQ0000000000000000000A",
        label: "Q-001 First",
      },
      {
        key: "Q-002.md",
        id: "01JAXQ0000000000000000000B",
        label: "Q-002 Second",
      },
    ]);
  });

  it("is empty for a project with no questions", () => {
    expect(questionsOf({ questions: [] })).toEqual([]);
  });
});

describe("reconcileQuestion", () => {
  const questions = questionsOf(arranged);

  it("keeps a question that is still there", () => {
    expect(reconcileQuestion("Q-002.md", questions)).toBe("Q-002.md");
  });

  it("moves to the first question when the one shown is gone or none was chosen", () => {
    expect(reconcileQuestion("Q-009.md", questions)).toBe("Q-001.md");
    expect(reconcileQuestion(null, questions)).toBe("Q-001.md");
  });

  it("is none when there are no questions", () => {
    expect(reconcileQuestion("Q-001.md", [])).toBeNull();
  });
});
