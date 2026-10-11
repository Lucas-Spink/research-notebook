import { fail, ok, type Result } from "../result";
import {
  checkedProject,
  noChange,
  projectStep,
  stamped,
  tidied,
  withExperimentAppended,
} from "./project-edit";
import type { NotebookEnv, NotebookError, NotebookState, Plan } from "./types";

/** What was put back from the bin: a question's file name, or an experiment's folder. */
export type Restored = { questionFile?: string; experimentFolder?: string };

const byRef = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

/**
 * Lists a restored question or experiment in `project.yaml`'s saved order
 * again (ADR-0062). Deleting drops them from the order, and restoring only
 * moves their files back, so without this they come back marked "not in the
 * saved order".
 *
 * A question comes back with the experiments of its own that the order does
 * not list, by ref. An experiment is added at the end of its question's list.
 * Their old positions are not kept anywhere, so they are not recovered. An
 * experiment whose question has no file stays unassigned, as it is shown.
 * Nothing is written when there is nothing to add.
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
    const missing = state.experiments
      .filter((e) => e.file.frontmatter.question === id)
      .filter((e) => !listed.has(e.file.frontmatter.id))
      .sort((a, b) => byRef(a.file.frontmatter.ref, b.file.frontmatter.ref))
      .map((e) => e.file.frontmatter.id);
    const entry = order.find((e) => e.question === id);
    order =
      entry === undefined
        ? [...order, { question: id, experiments: missing }]
        : order.map((e) =>
            e === entry
              ? { ...e, experiments: [...e.experiments, ...missing] }
              : e,
          );
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
      order = withExperimentAppended(
        order,
        question,
        experiment.file.frontmatter.id,
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
