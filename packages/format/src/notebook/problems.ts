import type { LoadedExperiment, LoadedQuestion, NotebookState } from "./types";

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

/** The first item with each ID, and the items that repeat an ID that came earlier. */
export type FirstById<T> = { first: Map<string, T>; later: Set<T> };

export type Identified = {
  questions: FirstById<LoadedQuestion>;
  experiments: FirstById<LoadedExperiment>;
};

function firstById<T>(
  items: readonly T[],
  id: (item: T) => string,
): FirstById<T> {
  const first = new Map<string, T>();
  const later = new Set<T>();
  for (const item of items) {
    if (first.has(id(item))) later.add(item);
    else first.set(id(item), item);
  }
  return { first, later };
}

/** Which file of each ID came first; the ID is authoritative and the first file is the one used. */
export function identify(state: NotebookState): Identified {
  return {
    questions: firstById(state.questions, (q) => q.file.frontmatter.id),
    experiments: firstById(state.experiments, (e) => e.file.frontmatter.id),
  };
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
    if (ids.length > 1) {
      found.push({ kind: "duplicateRef", entity, ref: key, ids });
    }
  }
  return found;
}

/** What `project.yaml` names that the files do not bear out. */
function orderProblems(state: NotebookState, ids: Identified): Problem[] {
  const found: Problem[] = [];
  for (const entry of state.project.order) {
    if (!ids.questions.first.has(entry.question)) {
      found.push({
        kind: "orderNamesNoFile",
        entity: "question",
        id: entry.question,
      });
    }
    for (const id of entry.experiments) {
      const experiment = ids.experiments.first.get(id);
      if (experiment === undefined) {
        found.push({ kind: "orderNamesNoFile", entity: "experiment", id });
      } else if (experiment.file.frontmatter.question !== entry.question) {
        found.push({
          kind: "orderMisplaced",
          experiment: id,
          listedUnder: entry.question,
        });
      }
    }
  }
  return found;
}

/** Everything wrong with the refs, IDs, folders, order and files (FR-EXP-07, format-v1.md section 5). */
export function findProblems(state: NotebookState, ids: Identified): Problem[] {
  const found = orderProblems(state, ids);
  found.push(
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
      found.push({
        kind: "folderRefMismatch",
        folder,
        ref: file.frontmatter.ref,
        id: file.frontmatter.id,
      });
    }
  }
  for (const path of state.unreadable) found.push({ kind: "unreadable", path });
  return found;
}
