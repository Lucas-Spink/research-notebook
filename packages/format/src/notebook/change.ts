import { serialiseExperiment } from "../files/experiment";
import { fail, ok, type Result } from "../result";
import { ExperimentFrontmatter } from "../schema";
import {
  checkedProject,
  missingExperiment,
  missingQuestion,
  noChange,
  projectStep,
  stamped,
  tidied,
  withExperimentAppended,
  withoutExperiment,
} from "./project-edit";
import {
  experimentFolderPath,
  questionPath,
  type NotebookEnv,
  type NotebookError,
  type NotebookState,
  type Plan,
} from "./types";
import { formatTimestamp, refusal } from "./util";

/**
 * Moves an experiment to another question (FR-EXP-04) by changing its
 * `question` value and the order lists; the folder stays where it is.
 * `experiment.md` is written first and `project.yaml` last. If the two are
 * ever out of step, the experiment's own file decides which question it is
 * shown under (ADR-0026).
 */
export function moveExperiment(
  state: NotebookState,
  id: string,
  questionId: string,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const found = state.experiments.find((e) => e.file.frontmatter.id === id);
  if (found === undefined) return fail(missingExperiment(id));
  if (!state.questions.some((q) => q.file.frontmatter.id === questionId)) {
    return fail(missingQuestion(questionId));
  }
  if (found.file.frontmatter.question === questionId) {
    return ok(noChange(state));
  }
  const frontmatter = ExperimentFrontmatter.safeParse({
    ...found.file.frontmatter,
    question: questionId,
    updated: formatTimestamp(env.now()),
  });
  if (!frontmatter.success) return fail(refusal(frontmatter.error));

  const moved = {
    ...found,
    file: { ...found.file, frontmatter: frontmatter.data },
  };
  const experiments = state.experiments.map((e) => (e === found ? moved : e));
  const project = checkedProject(
    tidied(
      stamped(
        {
          ...state.project,
          order: withExperimentAppended(
            withoutExperiment(state.project.order, id),
            questionId,
            id,
          ),
        },
        env,
      ),
      state.questions,
      experiments,
      state.unreadable,
    ),
  );
  if (!project.ok) return project;
  return ok({
    steps: [
      {
        kind: "replace",
        path: `${experimentFolderPath(found.folder)}/experiment.md`,
        text: serialiseExperiment(moved.file),
      },
      projectStep(project.value),
    ],
    next: { ...state, project: project.value, experiments },
  });
}

/**
 * Deletes an experiment by moving its folder to `.trash/` (FR-EXP-06), then
 * dropping it from the order. The counter is not lowered, so its ref is not
 * given out again (FR-EXP-03).
 */
export function removeExperiment(
  state: NotebookState,
  id: string,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const found = state.experiments.find((e) => e.file.frontmatter.id === id);
  if (found === undefined) return fail(missingExperiment(id));
  const experiments = state.experiments.filter((e) => e !== found);
  const project = checkedProject(
    tidied(
      stamped(
        {
          ...state.project,
          order: withoutExperiment(state.project.order, id),
        },
        env,
      ),
      state.questions,
      experiments,
      state.unreadable,
    ),
  );
  if (!project.ok) return project;
  return ok({
    steps: [
      { kind: "trash", path: experimentFolderPath(found.folder) },
      projectStep(project.value),
    ],
    next: {
      ...state,
      project: project.value,
      experiments,
      ...(state.artefacts === undefined
        ? {}
        : {
            artefacts: Object.fromEntries(
              Object.entries(state.artefacts).filter(
                ([folder]) => folder !== found.folder,
              ),
            ),
          }),
    },
  });
}

/**
 * Deletes a question by moving its file to `.trash/` (FR-EXP-06). Only the
 * file moves: its experiments stay where they are and are shown under
 * Unassigned (FR-EXP-08), so nothing is lost with it (ADR-0026).
 */
export function removeQuestion(
  state: NotebookState,
  id: string,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const found = state.questions.find((q) => q.file.frontmatter.id === id);
  if (found === undefined) return fail(missingQuestion(id));
  const questions = state.questions.filter((q) => q !== found);
  const project = checkedProject(
    tidied(
      stamped(
        {
          ...state.project,
          order: state.project.order.filter((entry) => entry.question !== id),
          table: {
            ...state.project.table,
            collapsed_questions: state.project.table.collapsed_questions.filter(
              (collapsed) => collapsed !== id,
            ),
          },
        },
        env,
      ),
      questions,
      state.experiments,
      state.unreadable,
    ),
  );
  if (!project.ok) return project;
  return ok({
    steps: [
      { kind: "trash", path: questionPath(found.fileName) },
      projectStep(project.value),
    ],
    next: { ...state, project: project.value, questions },
  });
}
