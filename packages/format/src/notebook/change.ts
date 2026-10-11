import { serialiseExperiment } from "../files/experiment";
import { fail, ok, type Result } from "../result";
import { ExperimentFrontmatter } from "../schema";
import { arrangeNotebook } from "./arrange";
import { serialiseBinNote, type BinNote } from "./bin-note";
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
  type Step,
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

/** The `.trash/` step for `path`, with a note of where it was shown. */
function trashStep(path: string, note: BinNote): Step {
  return { kind: "trash", path, note: serialiseBinNote(note) };
}

/** `artefacts` without the experiment folders in `gone`. */
function withoutFolders(
  artefacts: NotebookState["artefacts"],
  gone: ReadonlySet<string>,
): Pick<NotebookState, "artefacts"> {
  if (artefacts === undefined) return {};
  return {
    artefacts: Object.fromEntries(
      Object.entries(artefacts).filter(([folder]) => !gone.has(folder)),
    ),
  };
}

/**
 * Deletes an experiment by moving its folder to `.trash/` (FR-EXP-06), then
 * dropping it from the order. The counter is not lowered, so its ref is not
 * given out again (FR-EXP-03). Its place under its question is kept with it
 * in the bin so a restore can put it back (ADR-0063).
 */
export function removeExperiment(
  state: NotebookState,
  id: string,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const found = state.experiments.find((e) => e.file.frontmatter.id === id);
  if (found === undefined) return fail(missingExperiment(id));
  const experiments = state.experiments.filter((e) => e !== found);
  const shown = arrangeNotebook(state).questions.find(
    (q) => q.question.file.frontmatter.id === found.file.frontmatter.question,
  );
  const index =
    shown?.experiments.findIndex((e) => e.experiment === found) ?? -1;
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
  const path = experimentFolderPath(found.folder);
  return ok({
    steps: [
      index < 0
        ? { kind: "trash", path }
        : trashStep(path, { index, experiments: [] }),
      projectStep(project.value),
    ],
    next: {
      ...state,
      project: project.value,
      experiments,
      ...withoutFolders(state.artefacts, new Set([found.folder])),
    },
  });
}

/**
 * Deletes a question by moving its file to `.trash/` (FR-EXP-06), after the
 * folders of all its experiments, so none is left shown as Unassigned
 * (ADR-0063, which replaces ADR-0026 point 5). The question's place among the
 * questions and its experiments' order are kept with it in the bin, so one
 * restore puts everything back where it was.
 */
export function removeQuestion(
  state: NotebookState,
  id: string,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const found = state.questions.find((q) => q.file.frontmatter.id === id);
  if (found === undefined) return fail(missingQuestion(id));
  const arranged = arrangeNotebook(state).questions;
  const index = arranged.findIndex((q) => q.question === found);
  const taken = (arranged[index]?.experiments ?? []).map((e) => e.experiment);
  const questions = state.questions.filter((q) => q !== found);
  const experiments = state.experiments.filter((e) => !taken.includes(e));
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
      experiments,
      state.unreadable,
    ),
  );
  if (!project.ok) return project;
  return ok({
    steps: [
      ...taken.map((e, position) =>
        trashStep(experimentFolderPath(e.folder), {
          index: position,
          experiments: [],
        }),
      ),
      trashStep(questionPath(found.fileName), {
        index: Math.max(index, 0),
        experiments: taken.map((e) => e.folder),
      }),
      projectStep(project.value),
    ],
    next: {
      ...state,
      project: project.value,
      questions,
      experiments,
      ...withoutFolders(state.artefacts, new Set(taken.map((e) => e.folder))),
    },
  });
}
