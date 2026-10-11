import { fail, ok, type Result } from "../result";
import { arrangeNotebook } from "./arrange";
import type { BinNote } from "./bin-note";
import {
  checkedProject,
  noChange,
  projectStep,
  stamped,
  tidied,
} from "./project-edit";
import type { NotebookEnv, NotebookError, NotebookState, Plan } from "./types";

/**
 * What was put back from the bin: a question's file name, or an experiment's
 * folder, with the note kept beside it when it was binned (ADR-0063).
 */
export type Restored = {
  questionFile?: string;
  experimentFolder?: string;
  note?: BinNote;
};

type Order = NotebookState["project"]["order"];

const byRef = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

/** `list` with `item` inserted at `index`, or at the end if that is past it. */
function insertedAt<T>(list: readonly T[], index: number, item: T): T[] {
  const at = Math.min(index, list.length);
  return [...list.slice(0, at), item, ...list.slice(at)];
}

/**
 * `order` with `question` listed at `index` among the questions as shown,
 * which includes those the order does not list, so its place does not depend
 * on how many of them there are.
 */
function withQuestionAt(
  state: NotebookState,
  question: string,
  index: number,
): Order {
  const shown = arrangeNotebook(state)
    .questions.map((q) => q.question.file.frontmatter.id)
    .filter((id) => id !== question);
  return insertedAt(shown, index, question).map(
    (id) =>
      state.project.order.find((e) => e.question === id) ?? {
        question: id,
        experiments: [],
      },
  );
}

/** `order` with `experiment` in `question`'s list at `index`, which is added if there is none. */
function withExperimentAt(
  order: Order,
  question: string,
  experiment: string,
  index: number,
): Order {
  if (!order.some((e) => e.question === question)) {
    return [...order, { question, experiments: [experiment] }];
  }
  return order.map((e) =>
    e.question === question
      ? { ...e, experiments: insertedAt(e.experiments, index, experiment) }
      : e,
  );
}

/**
 * The experiments of `question` that the order does not list: those the note
 * names first, in its order, then the rest by ref.
 */
function unlistedExperiments(
  state: NotebookState,
  question: string,
  listed: ReadonlySet<string>,
  note: BinNote | undefined,
): string[] {
  const missing = state.experiments
    .filter((e) => e.file.frontmatter.question === question)
    .filter((e) => !listed.has(e.file.frontmatter.id));
  const named = (note?.experiments ?? []).flatMap((folder) =>
    missing.filter((e) => e.folder === folder).slice(0, 1),
  );
  const rest = missing
    .filter((e) => !named.includes(e))
    .sort((a, b) => byRef(a.file.frontmatter.ref, b.file.frontmatter.ref));
  return [...named, ...rest].map((e) => e.file.frontmatter.id);
}

/**
 * Lists a restored question or experiment in `project.yaml`'s saved order
 * again (ADR-0062). Deleting drops them from the order, and restoring only
 * moves their files back, so without this they come back marked "not in the
 * saved order".
 *
 * With the note kept in the bin (ADR-0063) a question returns to its old
 * place among the questions, with its experiments in their old order, and an
 * experiment to its old place under its question; a place past the end means
 * the end. Without a note, a question is added at the end with the
 * experiments of its own that the order does not list, by ref, and an
 * experiment at the end of its question's list. An experiment whose question
 * has no file stays unassigned, as it is shown. Nothing is written when there
 * is nothing to add.
 */
export function adoptIntoOrder(
  state: NotebookState,
  restored: Restored,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const listed = new Set(state.project.order.flatMap((e) => e.experiments));
  let order = state.project.order;

  if (restored.questionFile !== undefined) {
    const question = state.questions.find(
      (q) => q.fileName === restored.questionFile,
    );
    if (question === undefined) return ok(noChange(state));
    const id = question.file.frontmatter.id;
    const missing = unlistedExperiments(state, id, listed, restored.note);
    const entry = order.find((e) => e.question === id);
    if (entry !== undefined) {
      order = order.map((e) =>
        e === entry ? { ...e, experiments: [...e.experiments, ...missing] } : e,
      );
    } else if (restored.note === undefined) {
      order = [...order, { question: id, experiments: missing }];
    } else {
      order = withQuestionAt(state, id, restored.note.index).map((e) =>
        e.question === id ? { ...e, experiments: missing } : e,
      );
    }
  }

  if (restored.experimentFolder !== undefined) {
    const experiment = state.experiments.find(
      (e) => e.folder === restored.experimentFolder,
    );
    const question = experiment?.file.frontmatter.question;
    if (
      experiment !== undefined &&
      question !== undefined &&
      !listed.has(experiment.file.frontmatter.id) &&
      state.questions.some((q) => q.file.frontmatter.id === question)
    ) {
      order = withExperimentAt(
        order,
        question,
        experiment.file.frontmatter.id,
        restored.note?.index ?? Number.MAX_SAFE_INTEGER,
      );
    }
  }

  if (JSON.stringify(order) === JSON.stringify(state.project.order)) {
    return ok(noChange(state));
  }
  const project = checkedProject(
    tidied(
      stamped({ ...state.project, order }, env),
      state.questions,
      state.experiments,
      state.unreadable,
    ),
  );
  if (!project.ok) return fail(project.error);
  return ok({
    steps: [projectStep(project.value)],
    next: { ...state, project: project.value },
  });
}
