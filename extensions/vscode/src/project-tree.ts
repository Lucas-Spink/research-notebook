import { isAbsolute, relative, sep } from "node:path";

import type { ExperimentChoice } from "./experiments";
import { findProjectRoot } from "./project";

/** One question and the experiments under it, as the STRATA view lists them. */
export interface QuestionGroup {
  questionRef: string;
  questionTitle: string;
  experiments: ExperimentChoice[];
}

/** `ExperimentChoice.questionRef` for an experiment whose question has no file. */
const NO_QUESTION = "?";

const byRef = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { numeric: true });

/**
 * The experiments grouped by question, questions and experiments in order of
 * their numbers (so `Q-2` comes before `Q-10`). Experiments whose question
 * has no file are gathered last, under `?`, as the desktop app puts them
 * under Unassigned.
 */
export function groupByQuestion(
  choices: readonly ExperimentChoice[],
): QuestionGroup[] {
  const groups = new Map<string, QuestionGroup>();
  for (const choice of choices) {
    const group = groups.get(choice.questionRef) ?? {
      questionRef: choice.questionRef,
      questionTitle: choice.questionTitle,
      experiments: [],
    };
    group.experiments.push(choice);
    groups.set(choice.questionRef, group);
  }
  const ordered = [...groups.values()];
  for (const group of ordered) {
    group.experiments.sort((a, b) => byRef(a.ref, b.ref));
  }
  return ordered.sort((a, b) => {
    if (a.questionRef === NO_QUESTION)
      return b.questionRef === NO_QUESTION ? 0 : 1;
    if (b.questionRef === NO_QUESTION) return -1;
    return byRef(a.questionRef, b.questionRef);
  });
}

/**
 * The Research Notebook projects the workspace folders belong to: each
 * folder's own project or the one above it (FR-VSC-02), once however many
 * folders share it, in the order the folders were given. `exists` is injected
 * as in `findProjectRoot`.
 */
export function projectRootsOf(
  folders: readonly string[],
  exists: (path: string) => boolean,
): string[] {
  const roots: string[] = [];
  for (const folder of folders) {
    const root = findProjectRoot(folder, exists);
    if (root !== undefined && !roots.includes(root)) roots.push(root);
  }
  return roots;
}

/**
 * Whether `file` is somewhere inside the project folder `root`. A request
 * records its source relative to the project (spec 5.10), so a file from
 * elsewhere on disk cannot be captured by the extension (ADR-0034 point 5).
 */
export function isInsideProject(root: string, file: string): boolean {
  const path = relative(root, file);
  return (
    path !== "" &&
    path !== ".." &&
    !path.startsWith(`..${sep}`) &&
    !isAbsolute(path)
  );
}
