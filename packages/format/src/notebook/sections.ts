import { serialiseExperiment } from "../files/experiment";
import {
  setExperimentSection,
  type RecognisedSectionKey,
} from "../experiment-edit";
import { fail, ok, type Result } from "../result";
import { ExperimentFrontmatter } from "../schema";
import {
  invalid,
  missingExperiment,
  noChange,
  projectStep,
  stamped,
} from "./project-edit";
import {
  experimentFolderPath,
  type NotebookEnv,
  type NotebookError,
  type NotebookState,
  type Plan,
} from "./types";
import { formatTimestamp, refusal } from "./util";

/**
 * Edits the text of one recognised section of an experiment (FR-EDT-03): the
 * body of the expanded view's autosave. Only `experiment.md` is written, with
 * `updated` set to now; the frontmatter's other fields, the preamble, unknown
 * sections and the literature block are carried over as they were.
 *
 * The text is refused, and nothing changes, if it would break the file's
 * structure when read back (a level-2 heading, an unclosed fence, a
 * literature marker — format-v1.md 4.3): the person's words are never lost to
 * a save that would corrupt the file. Nothing is written when the text is
 * already what is stored.
 */
export function editExperimentSection(
  state: NotebookState,
  id: string,
  key: RecognisedSectionKey,
  text: string,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const found = state.experiments.find((e) => e.file.frontmatter.id === id);
  if (found === undefined) return fail(missingExperiment(id));

  const before =
    found.file.body.sections.find((s) => s.key === key)?.body ?? "";
  const updatedBody = setExperimentSection(found.file.body, key, text);
  if (!updatedBody.ok) {
    return fail(invalid(updatedBody.error.message, "text"));
  }
  const stored =
    updatedBody.value.sections.find((s) => s.key === key)?.body ?? "";
  if (stored === before) return ok(noChange(state));

  const checked = ExperimentFrontmatter.safeParse({
    ...found.file.frontmatter,
    updated: formatTimestamp(env.now()),
  });
  if (!checked.success) return fail(refusal(checked.error));
  const edited = {
    ...found,
    file: { frontmatter: checked.data, body: updatedBody.value },
  };
  const needsStamp = state.project.last_written_by !== env.appVersion;
  const project = needsStamp ? stamped(state.project, env) : state.project;
  return ok({
    steps: [
      ...(needsStamp ? [projectStep(project)] : []),
      {
        kind: "replace",
        path: `${experimentFolderPath(found.folder)}/experiment.md`,
        text: serialiseExperiment(edited.file),
      },
    ],
    next: {
      ...state,
      project,
      experiments: state.experiments.map((e) => (e === found ? edited : e)),
    },
  });
}
