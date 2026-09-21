import { serialiseArtefacts } from "../files/artefacts";
import { serialiseExperiment } from "../files/experiment";
import { serialiseQuestion } from "../files/question";
import { fail, ok, type Result } from "../result";
import {
  ExperimentFrontmatter,
  QuestionFrontmatter,
  RECOGNISED_SECTIONS,
} from "../schema";
import {
  checkedProject,
  idInUse,
  invalid,
  projectStep,
  stamped,
  tidied,
  withExperimentAppended,
} from "./project-edit";
import { formatRef, nextRefNumber } from "./refs";
import {
  experimentFolderPath,
  questionPath,
  type LoadedExperiment,
  type LoadedQuestion,
  type NotebookEnv,
  type NotebookError,
  type NotebookState,
  type Plan,
} from "./types";
import { formatTimestamp, refusal } from "./util";

/**
 * A new question (FR-EXP-01): a new ULID and the next `Q-###` ref, an empty
 * Motivation, appended to the order. The question file is written first and
 * `project.yaml` last, so a stop between them leaves a question that only
 * lacks its place in the order, never a place with no question.
 */
export function createQuestion(
  state: NotebookState,
  input: { title: string },
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const number = nextRefNumber("question", state);
  const id = env.newId();
  if (idInUse(state, id)) return fail(invalid("identifier already in use"));
  const ref = formatRef("Q", number);
  const frontmatter = QuestionFrontmatter.safeParse({
    id,
    ref,
    title: input.title.trim(),
    created: formatTimestamp(env.now()),
  });
  if (!frontmatter.success) return fail(refusal(frontmatter.error));

  const question: LoadedQuestion = {
    fileName: `${ref}.md`,
    file: { frontmatter: frontmatter.data, body: "" },
  };
  const questions = [...state.questions, question];
  const project = checkedProject(
    tidied(
      stamped(
        {
          ...state.project,
          numbering: { ...state.project.numbering, next_question: number + 1 },
          order: [...state.project.order, { question: id, experiments: [] }],
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
      {
        kind: "create",
        path: questionPath(question.fileName),
        text: serialiseQuestion(question.file),
      },
      projectStep(project.value),
    ],
    next: { ...state, project: project.value, questions },
  });
}

/**
 * A new experiment in a question (FR-EXP-02): a new ULID, the next `EXP-###`
 * ref, its folder, an `experiment.md` with empty sections and an empty
 * `artefacts.yaml`, appended to the question's order. `project.yaml` is
 * written last, so a stop part way leaves an experiment absent from the
 * order, which is shown at the end of its question (FR-EXP-08).
 */
export function createExperiment(
  state: NotebookState,
  input: { questionId: string; title: string },
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const question = state.questions.find(
    (q) => q.file.frontmatter.id === input.questionId,
  );
  if (question === undefined) {
    return fail({ kind: "notFound", entity: "question", id: input.questionId });
  }
  const number = nextRefNumber("experiment", state);
  const id = env.newId();
  if (idInUse(state, id)) return fail(invalid("identifier already in use"));
  const ref = formatRef("EXP", number);
  const now = formatTimestamp(env.now());
  const frontmatter = ExperimentFrontmatter.safeParse({
    id,
    ref,
    question: input.questionId,
    title: input.title.trim(),
    status: "planned",
    created: now,
    updated: now,
  });
  if (!frontmatter.success) return fail(refusal(frontmatter.error));

  const experiment: LoadedExperiment = {
    folder: ref,
    file: {
      frontmatter: frontmatter.data,
      body: {
        preamble: "",
        sections: RECOGNISED_SECTIONS.map((key) => ({ key, body: "" })),
        literature: null,
      },
    },
  };
  const experiments = [...state.experiments, experiment];
  const project = checkedProject(
    tidied(
      stamped(
        {
          ...state.project,
          numbering: {
            ...state.project.numbering,
            next_experiment: number + 1,
          },
          order: withExperimentAppended(
            state.project.order,
            input.questionId,
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
  const folder = experimentFolderPath(experiment.folder);
  return ok({
    steps: [
      {
        kind: "create",
        path: `${folder}/experiment.md`,
        text: serialiseExperiment(experiment.file),
      },
      {
        kind: "create",
        path: `${folder}/artefacts.yaml`,
        text: serialiseArtefacts({
          format_version: 1,
          artefacts: [],
          groups: [],
        }),
      },
      projectStep(project.value),
    ],
    next: { ...state, project: project.value, experiments },
  });
}
