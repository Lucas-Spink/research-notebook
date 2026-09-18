import type { ExperimentRow, Question } from "./generateExperiments";

/**
 * One row in the flattened, virtualisable row list: either a full-width
 * question header (FR-TBL-02, rendered by the app per ADR-0005) or an
 * experiment row (FR-TBL-01). TanStack Virtual needs a single flat array, so
 * headers and experiments are interleaved here rather than nested.
 */
export type TableRow =
  | {
      readonly type: "question-header";
      readonly question: Question;
      readonly experimentCount: number;
    }
  | {
      readonly type: "experiment";
      readonly question: Question;
      readonly experiment: ExperimentRow;
    };

/**
 * Flattens questions and experiments into one row-per-question-header plus
 * one row per experiment, in question order (project.yaml ordering) with
 * each question's experiments following its header, in their given order.
 */
export function buildTableRows(
  questions: readonly Question[],
  experiments: readonly ExperimentRow[],
): TableRow[] {
  const experimentsByQuestion = new Map<string, ExperimentRow[]>();
  for (const experiment of experiments) {
    const group = experimentsByQuestion.get(experiment.questionId);
    if (group) {
      group.push(experiment);
    } else {
      experimentsByQuestion.set(experiment.questionId, [experiment]);
    }
  }

  const rows: TableRow[] = [];
  for (const question of questions) {
    const questionExperiments = experimentsByQuestion.get(question.id) ?? [];
    rows.push({
      type: "question-header",
      question,
      experimentCount: questionExperiments.length,
    });
    for (const experiment of questionExperiments) {
      rows.push({ type: "experiment", question, experiment });
    }
  }
  return rows;
}
