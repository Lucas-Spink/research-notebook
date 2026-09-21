import { serialiseExperiment } from "../files/experiment";
import { serialiseQuestion } from "../files/question";
import { fail, ok, type Result } from "../result";
import {
  ExperimentFrontmatter,
  QuestionFrontmatter,
  type EXPERIMENT_STATUSES,
} from "../schema";
import {
  checkedProject,
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
  type Step,
} from "./types";
import { formatTimestamp, refusal } from "./util";

export type ExperimentStatus = (typeof EXPERIMENT_STATUSES)[number];

/**
 * The values of an experiment a person can edit (FR-EXP-05). A field left out
 * is left as it is; a date of `null` clears it, which removes the key
 * (format-v1.md 4.3: an explicit `null` is not written).
 */
export interface ExperimentChanges {
  title?: string;
  status?: ExperimentStatus;
  started?: string | null;
  completed?: string | null;
}

const noChange = (state: NotebookState): Plan => ({ steps: [], next: state });

const missingExperiment = (id: string): NotebookError => ({
  kind: "notFound",
  entity: "experiment",
  id,
});

const missingQuestion = (id: string): NotebookError => ({
  kind: "notFound",
  entity: "question",
  id,
});

/**
 * When another version of the application wrote the project last, this one
 * records itself before its first write of any kind, so `last_written_by`
 * stays true and the version-change backup is not made again at every open
 * (ADR-0025 point 8). Nothing to do when the versions already agree.
 */
function withWriterStamp(
  state: NotebookState,
  env: NotebookEnv,
): { state: NotebookState; steps: Step[] } {
  if (state.project.last_written_by === env.appVersion) {
    return { state, steps: [] };
  }
  const project = stamped(state.project, env);
  return { state: { ...state, project }, steps: [projectStep(project)] };
}

/**
 * Edits an experiment's title, status and dates (FR-EXP-05). Only
 * `experiment.md` is written, with `updated` set to now; the body and every
 * key the format does not know are carried over as they were. Nothing is
 * written when nothing would change.
 */
export function editExperiment(
  state: NotebookState,
  id: string,
  changes: ExperimentChanges,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const found = state.experiments.find((e) => e.file.frontmatter.id === id);
  if (found === undefined) return fail(missingExperiment(id));
  const before = found.file.frontmatter;

  const candidate: Record<string, unknown> = {
    ...before,
    title: changes.title === undefined ? before.title : changes.title.trim(),
    status: changes.status ?? before.status,
  };
  for (const key of ["started", "completed"] as const) {
    const value = changes[key];
    if (value === null) delete candidate[key];
    else if (value !== undefined) candidate[key] = value;
  }
  const same =
    candidate.title === before.title &&
    candidate.status === before.status &&
    candidate.started === before.started &&
    candidate.completed === before.completed;
  const checked = ExperimentFrontmatter.safeParse(
    same ? candidate : { ...candidate, updated: formatTimestamp(env.now()) },
  );
  if (!checked.success) return fail(refusal(checked.error));
  if (same) return ok(noChange(state));

  const edited = {
    ...found,
    file: { ...found.file, frontmatter: checked.data },
  };
  const stamp = withWriterStamp(state, env);
  return ok({
    steps: [
      ...stamp.steps,
      {
        kind: "replace",
        path: `${experimentFolderPath(found.folder)}/experiment.md`,
        text: serialiseExperiment(edited.file),
      },
    ],
    next: {
      ...stamp.state,
      experiments: state.experiments.map((e) => (e === found ? edited : e)),
    },
  });
}

/** Edits a question's title. The Motivation and unknown keys are carried over. */
export function editQuestion(
  state: NotebookState,
  id: string,
  changes: { title: string },
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const found = state.questions.find((q) => q.file.frontmatter.id === id);
  if (found === undefined) return fail(missingQuestion(id));
  const title = changes.title.trim();
  const checked = QuestionFrontmatter.safeParse({
    ...found.file.frontmatter,
    title,
  });
  if (!checked.success) return fail(refusal(checked.error));
  if (title === found.file.frontmatter.title) return ok(noChange(state));

  const edited = {
    ...found,
    file: { ...found.file, frontmatter: checked.data },
  };
  const stamp = withWriterStamp(state, env);
  return ok({
    steps: [
      ...stamp.steps,
      {
        kind: "replace",
        path: questionPath(found.fileName),
        text: serialiseQuestion(edited.file),
      },
    ],
    next: {
      ...stamp.state,
      questions: state.questions.map((q) => (q === found ? edited : q)),
    },
  });
}

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
    next: { ...state, project: project.value, experiments },
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
