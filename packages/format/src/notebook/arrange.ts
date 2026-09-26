import {
  findProblems,
  identify,
  type Identified,
  type Problem,
} from "./problems";
import { refNumber } from "./refs";
import type {
  LoadedArtefacts,
  LoadedExperiment,
  LoadedQuestion,
  NotebookState,
} from "./types";

/** An experiment as shown: where it sits, and whether it may be changed. */
export interface ArrangedExperiment {
  experiment: LoadedExperiment;
  /** Another file with the same ID was loaded first, so this one is left alone (spec P6). */
  readOnly: boolean;
  /** Not listed in `project.yaml`, so shown after the listed ones (FR-EXP-08). */
  absentFromOrder: boolean;
  /** Its artefacts.yaml, when it has one (ADR-0044). */
  artefacts?: LoadedArtefacts;
}

export interface ArrangedQuestion {
  question: LoadedQuestion;
  /** Another file with the same ID was loaded first, so this one is left alone (spec P6). */
  readOnly: boolean;
  experiments: ArrangedExperiment[];
}

export interface Arranged {
  questions: ArrangedQuestion[];
  /** Experiments whose question has no file (FR-EXP-08). */
  unassigned: ArrangedExperiment[];
  problems: Problem[];
}

/** By ref number, then by name, so the order does not depend on the order files were read in. */
function byRefThenName<T>(
  ref: (item: T) => string,
  name: (item: T) => string,
): (a: T, b: T) => number {
  return (a, b) => {
    const left = refNumber(ref(a)) ?? Number.POSITIVE_INFINITY;
    const right = refNumber(ref(b)) ?? Number.POSITIVE_INFINITY;
    if (left !== right) return left < right ? -1 : 1;
    const x = name(a);
    const y = name(b);
    return x < y ? -1 : x > y ? 1 : 0;
  };
}

const experimentOrder = byRefThenName<LoadedExperiment>(
  (e) => e.file.frontmatter.ref,
  (e) => e.folder,
);

/** Questions in the order of `project.yaml`, then those it does not list, by ref. */
function orderedQuestions(
  state: NotebookState,
  ids: Identified,
): LoadedQuestion[] {
  const listed = state.project.order.flatMap(
    (entry) => ids.questions.first.get(entry.question) ?? [],
  );
  const inOrder = new Set(listed);
  const unlisted = state.questions
    .filter((q) => !inOrder.has(q))
    .sort(
      byRefThenName(
        (q) => q.file.frontmatter.ref,
        (q) => q.fileName,
      ),
    );
  return [...listed, ...unlisted];
}

/**
 * Puts each experiment under the question its own file names: those the order
 * lists under that question first, in order, then the rest by ref. What is
 * left has no question with a file.
 */
function placeExperiments(
  state: NotebookState,
  questions: readonly LoadedQuestion[],
  ids: Identified,
): { questions: ArrangedQuestion[]; unassigned: ArrangedExperiment[] } {
  const placed = new Set<LoadedExperiment>();
  const shown = (
    experiment: LoadedExperiment,
    absentFromOrder: boolean,
  ): ArrangedExperiment => {
    const artefacts = state.artefacts?.[experiment.folder];
    return {
      experiment,
      readOnly: ids.experiments.later.has(experiment),
      absentFromOrder,
      ...(artefacts === undefined ? {} : { artefacts }),
    };
  };

  const arranged = questions.map((question): ArrangedQuestion => {
    const id = question.file.frontmatter.id;
    const entry = state.project.order.find((e) => e.question === id);
    const experiments: ArrangedExperiment[] = [];
    for (const experimentId of entry?.experiments ?? []) {
      const experiment = ids.experiments.first.get(experimentId);
      if (experiment?.file.frontmatter.question !== id) continue;
      placed.add(experiment);
      experiments.push(shown(experiment, false));
    }
    const rest = state.experiments
      .filter((e) => e.file.frontmatter.question === id && !placed.has(e))
      .sort(experimentOrder);
    for (const experiment of rest) {
      placed.add(experiment);
      experiments.push(shown(experiment, true));
    }
    return {
      question,
      readOnly: ids.questions.later.has(question),
      experiments,
    };
  });

  const unassigned = state.experiments
    .filter((e) => !placed.has(e))
    .sort(experimentOrder)
    .map((experiment) => shown(experiment, true));
  return { questions: arranged, unassigned };
}

/**
 * Decides where each question and experiment is shown, and what is wrong
 * with them (FR-EXP-07, FR-EXP-08, format-v1.md section 5).
 *
 * Questions follow `project.yaml`, then those it does not list, by ref.
 * Within a question, experiments follow the order, then those it does not
 * list, by ref. An experiment is shown under the question its own file names,
 * whatever the order says, and under Unassigned if that question has no file.
 * Nothing is hidden and nothing is renumbered.
 */
export function arrangeNotebook(state: NotebookState): Arranged {
  const ids = identify(state);
  const placed = placeExperiments(state, orderedQuestions(state, ids), ids);
  return { ...placed, problems: findProblems(state, ids) };
}
