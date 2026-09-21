import { serialiseProject } from "../files";
import { fail, ok, type Result } from "../result";
import { ProjectYaml, type ProjectYamlModel } from "../schema";
import {
  PROJECT_PATH,
  type LoadedExperiment,
  type LoadedQuestion,
  type NotebookEnv,
  type NotebookError,
  type NotebookState,
  type Plan,
  type Step,
} from "./types";

/** The step that replaces `project.yaml` with `project`. */
export function projectStep(project: ProjectYamlModel): Step {
  return {
    kind: "replace",
    path: PROJECT_PATH,
    text: serialiseProject(project),
  };
}

/** Records the running version as the last writer (format-v1.md 4.1). */
export function stamped(
  project: ProjectYamlModel,
  env: NotebookEnv,
): ProjectYamlModel {
  return { ...project, last_written_by: env.appVersion };
}

/**
 * Drops what format-v1.md section 5 says is dropped on the next write of
 * `project.yaml`: an entry naming a question with no file, and an experiment
 * listed under a question that is not the one its own file names (the file's
 * `question` is authoritative, ADR-0026). Nothing is dropped while some file
 * could not be read, because the entry may be that file's.
 */
export function tidied(
  project: ProjectYamlModel,
  questions: readonly LoadedQuestion[],
  experiments: readonly LoadedExperiment[],
  unreadable: readonly string[],
): ProjectYamlModel {
  if (unreadable.length > 0) return project;
  const known = new Set(questions.map((q) => q.file.frontmatter.id));
  const owner = new Map<string, string>();
  for (const { file } of experiments) {
    if (!owner.has(file.frontmatter.id)) {
      owner.set(file.frontmatter.id, file.frontmatter.question);
    }
  }
  return {
    ...project,
    order: project.order
      .filter((entry) => known.has(entry.question))
      .map((entry) => ({
        ...entry,
        experiments: entry.experiments.filter(
          (id) => owner.get(id) === entry.question,
        ),
      })),
  };
}

/** `order` with `experiment` removed from every list. */
export function withoutExperiment(
  order: ProjectYamlModel["order"],
  experiment: string,
): ProjectYamlModel["order"] {
  return order.map((entry) => ({
    ...entry,
    experiments: entry.experiments.filter((id) => id !== experiment),
  }));
}

/** `order` with `experiment` appended to `question`'s list, which is added if there is none. */
export function withExperimentAppended(
  order: ProjectYamlModel["order"],
  question: string,
  experiment: string,
): ProjectYamlModel["order"] {
  const listed = order.some((entry) => entry.question === question);
  if (!listed) return [...order, { question, experiments: [experiment] }];
  return order.map((entry) =>
    entry.question === question
      ? { ...entry, experiments: [...entry.experiments, experiment] }
      : entry,
  );
}

/** Whether `id` names a question, an experiment or the project already. */
export function idInUse(state: NotebookState, id: string): boolean {
  return (
    state.project.id === id ||
    state.questions.some((q) => q.file.frontmatter.id === id) ||
    state.experiments.some((e) => e.file.frontmatter.id === id)
  );
}

export function invalid(message: string, field?: string): NotebookError {
  return field === undefined
    ? { kind: "invalid", message }
    : { kind: "invalid", message, field };
}

/**
 * Checks a project this module built against the schema, so a mistake here
 * is reported instead of written. It is a guard against a bug, not a
 * user-facing check.
 */
export function checkedProject(
  candidate: ProjectYamlModel,
): Result<ProjectYamlModel, NotebookError> {
  const checked = ProjectYaml.safeParse(candidate);
  if (!checked.success) {
    return fail(
      invalid(`project.yaml would not be valid: ${checked.error.message}`),
    );
  }
  return ok(checked.data);
}

/** A plan that writes nothing and leaves the state as it is. */
export const noChange = (state: NotebookState): Plan => ({
  steps: [],
  next: state,
});

export const missingExperiment = (id: string): NotebookError => ({
  kind: "notFound",
  entity: "experiment",
  id,
});

export const missingQuestion = (id: string): NotebookError => ({
  kind: "notFound",
  entity: "question",
  id,
});
