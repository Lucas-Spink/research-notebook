import { describe, expect, it } from "vitest";
import { buildTableRows } from "./buildTableRows";
import { createRandom, generateExperiments } from "./generateExperiments";

describe("buildTableRows", () => {
  it("produces exactly one header row per question and 500 experiment rows", () => {
    const { questions, experiments } = generateExperiments(createRandom(1));
    const rows = buildTableRows(questions, experiments);

    const headerRows = rows.filter((row) => row.type === "question-header");
    const experimentRows = rows.filter((row) => row.type === "experiment");

    expect(headerRows).toHaveLength(questions.length);
    expect(experimentRows).toHaveLength(500);
    expect(rows).toHaveLength(headerRows.length + experimentRows.length);
  });

  it("orders headers to match question order, each followed by only its own experiments", () => {
    const { questions, experiments } = generateExperiments(
      createRandom(2),
      30,
      3,
    );
    const rows = buildTableRows(questions, experiments);

    const headerIndexes = rows
      .map((row, index) => (row.type === "question-header" ? index : -1))
      .filter((index) => index >= 0);

    expect(headerIndexes).toHaveLength(questions.length);

    questions.forEach((question, questionIndex) => {
      const headerIndex = headerIndexes[questionIndex];
      expect(headerIndex).toBeDefined();
      if (headerIndex === undefined) return;
      const headerRow = rows[headerIndex];
      expect(headerRow?.type).toBe("question-header");
      if (headerRow?.type !== "question-header") return;
      expect(headerRow.question.id).toBe(question.id);

      const nextHeaderIndex = headerIndexes[questionIndex + 1] ?? rows.length;
      const rowsForQuestion = rows.slice(headerIndex + 1, nextHeaderIndex);
      expect(
        rowsForQuestion.every(
          (row) => row.type === "experiment" && row.question.id === question.id,
        ),
      ).toBe(true);
      expect(rowsForQuestion).toHaveLength(headerRow.experimentCount);
    });
  });

  it("includes every experiment exactly once", () => {
    const { questions, experiments } = generateExperiments(
      createRandom(3),
      47,
      5,
    );
    const rows = buildTableRows(questions, experiments);

    const seenIds = rows
      .filter((row) => row.type === "experiment")
      .map((row) => (row.type === "experiment" ? row.experiment.id : ""));

    expect(new Set(seenIds).size).toBe(experiments.length);
    expect(seenIds.sort()).toEqual(
      [...experiments.map((experiment) => experiment.id)].sort(),
    );
  });
});
