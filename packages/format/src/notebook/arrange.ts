import { refNumber } from "./refs";
import type { LoadedExperiment, LoadedQuestion, NotebookState } from "./types";

/** An experiment as shown: where it sits, and whether it may be changed. */
export interface ArrangedExperiment {
  experiment: LoadedExperiment;
  /** Another file with the same ID was loaded first, so this one is left alone (spec P6). */
  readOnly: boolean;
  /** Not listed in `project.yaml`, so shown after the listed ones (FR-EXP-08). */
  absentFromOrder: boolean;
}

export interface ArrangedQuestion {
  question: LoadedQuestion;
  /** Another file with the same ID was loaded first, so this one is left alone (spec P6). */
  readOnly: boolean;
  experiments: ArrangedExperiment[];
}

/** Something wrong with the files or with `project.yaml`, reported and never repaired silently. */
export type Problem =
  /** Two files of one kind share a ref; the IDs stay authoritative (FR-EXP-07). */
  | {
      kind: "duplicateRef";
      entity: "question" | "experiment";
      ref: string;
      ids: string[];
    }
  /** Two files share an ID: the later one is read-only. `locations` are file names or folders. */
  | {
      kind: "duplicateId";
      entity: "question" | "experiment";
      id: string;
      locations: string[];
    }
  /** An experiment's folder is not named by its ref. */
  | { kind: "folderRefMismatch"; folder: string; ref: string; id: string }
  /** `order` names a question or experiment that has no file. */
  | { kind: "orderNamesNoFile"; entity: "question" | "experiment"; id: string }
  /** `order` lists an experiment under a question that is not the one its file names. */
  | { kind: "orderMisplaced"; experiment: string; listedUnder: string }
  /** A file could not be read and is left untouched. */
  | { kind: "unreadable"; path: string };

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

/** The first item with each ID, and the items that repeat an ID that came earlier. */
function firstById<T>(
  items: readonly T[],
  id: (item: T) => string,
): { first: Map<string, T>; later: Set<T> } {
  const first = new Map<string, T>();
  const later = new Set<T>();
  for (const item of items) {
    if (first.has(id(item))) later.add(item);
    else first.set(id(item), item);
  }
  return { first, later };
}

function duplicates<T>(
  entity: "question" | "experiment",
  items: readonly T[],
  id: (item: T) => string,
  ref: (item: T) => string,
  location: (item: T) => string,
): Problem[] {
  const found: Problem[] = [];
  const byId = new Map<string, T[]>();
  const byRef = new Map<string, string[]>();
  for (const item of items) {
    byId.set(id(item), [...(byId.get(id(item)) ?? []), item]);
    const ids = byRef.get(ref(item)) ?? [];
    if (!ids.includes(id(item))) byRef.set(ref(item), [...ids, id(item)]);
  }
  for (const [key, same] of byId) {
    if (same.length > 1) {
      found.push({
        kind: "duplicateId",
        entity,
        id: key,
        locations: same.map(location),
      });
    }
  }
  for (const [key, ids] of byRef) {
    if (ids.length > 1)
      found.push({ kind: "duplicateRef", entity, ref: key, ids });
  }
  return found;
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
  const questionsById = firstById(
    state.questions,
    (q) => q.file.frontmatter.id,
  );
  const experimentsById = firstById(
    state.experiments,
    (e) => e.file.frontmatter.id,
  );
  const problems: Problem[] = [];

  const listed = state.project.order.filter((entry) =>
    questionsById.first.has(entry.question),
  );
  const listedIds = new Set(listed.map((entry) => entry.question));
  const unlisted = state.questions
    .filter((q) => !listedIds.has(q.file.frontmatter.id))
    .sort(
      byRefThenName(
        (q) => q.file.frontmatter.ref,
        (q) => q.fileName,
      ),
    );
  const ordered = [
    ...listed.flatMap((entry) => questionsById.first.get(entry.question) ?? []),
    ...unlisted,
  ];

  const placed = new Set<LoadedExperiment>();
  const questions = ordered.map((question): ArrangedQuestion => {
    const id = question.file.frontmatter.id;
    const entry = state.project.order.find((e) => e.question === id);
    const experiments: ArrangedExperiment[] = [];
    for (const experimentId of entry?.experiments ?? []) {
      const experiment = experimentsById.first.get(experimentId);
      if (experiment?.file.frontmatter.question !== id) continue;
      placed.add(experiment);
      experiments.push({ experiment, readOnly: false, absentFromOrder: false });
    }
    const rest = state.experiments
      .filter((e) => e.file.frontmatter.question === id && !placed.has(e))
      .sort(
        byRefThenName(
          (e) => e.file.frontmatter.ref,
          (e) => e.folder,
        ),
      );
    for (const experiment of rest) {
      placed.add(experiment);
      experiments.push({
        experiment,
        readOnly: experimentsById.later.has(experiment),
        absentFromOrder: true,
      });
    }
    return {
      question,
      readOnly: questionsById.later.has(question),
      experiments,
    };
  });
  // A later file with an ID that was listed still counts as read-only where it sits.
  for (const group of questions) {
    for (const shown of group.experiments) {
      shown.readOnly = experimentsById.later.has(shown.experiment);
    }
  }

  const unassigned = state.experiments
    .filter((e) => !placed.has(e))
    .sort(
      byRefThenName(
        (e) => e.file.frontmatter.ref,
        (e) => e.folder,
      ),
    )
    .map((experiment) => ({
      experiment,
      readOnly: experimentsById.later.has(experiment),
      absentFromOrder: true,
    }));

  for (const entry of state.project.order) {
    if (!questionsById.first.has(entry.question)) {
      problems.push({
        kind: "orderNamesNoFile",
        entity: "question",
        id: entry.question,
      });
    }
    for (const id of entry.experiments) {
      const experiment = experimentsById.first.get(id);
      if (experiment === undefined) {
        problems.push({ kind: "orderNamesNoFile", entity: "experiment", id });
      } else if (experiment.file.frontmatter.question !== entry.question) {
        problems.push({
          kind: "orderMisplaced",
          experiment: id,
          listedUnder: entry.question,
        });
      }
    }
  }
  problems.push(
    ...duplicates(
      "question",
      state.questions,
      (q) => q.file.frontmatter.id,
      (q) => q.file.frontmatter.ref,
      (q) => q.fileName,
    ),
    ...duplicates(
      "experiment",
      state.experiments,
      (e) => e.file.frontmatter.id,
      (e) => e.file.frontmatter.ref,
      (e) => e.folder,
    ),
  );
  for (const { folder, file } of state.experiments) {
    if (folder !== file.frontmatter.ref) {
      problems.push({
        kind: "folderRefMismatch",
        folder,
        ref: file.frontmatter.ref,
        id: file.frontmatter.id,
      });
    }
  }
  for (const path of state.unreadable)
    problems.push({ kind: "unreadable", path });

  return { questions, unassigned, problems };
}
