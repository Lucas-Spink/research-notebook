import { serialiseExperiment } from "../files/experiment";
import {
  setExperimentLiterature,
  setExperimentSection,
  type RecognisedSectionKey,
} from "../experiment-edit";
import type { ExperimentBodyModel } from "../schema";
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

/** What else the same write may change besides the section's text. */
export interface SectionEditOptions {
  /**
   * The regenerated Literature block's content (FR-CIT-10), saved in the same
   * write as the text so the file is never left with citations and a block
   * that disagree. Left as it was when absent.
   */
  literature?: string;
}

type Found = NotebookState["experiments"][number];

/** The plan for `body` replacing `found`'s body, or no change when it is the same file. */
function planBodyEdit(
  state: NotebookState,
  found: Found,
  body: ExperimentBodyModel,
  unchanged: boolean,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  if (unchanged) return ok(noChange(state));
  const checked = ExperimentFrontmatter.safeParse({
    ...found.file.frontmatter,
    updated: formatTimestamp(env.now()),
  });
  if (!checked.success) return fail(refusal(checked.error));
  const edited = { ...found, file: { frontmatter: checked.data, body } };
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

/**
 * Edits the text of one recognised section of an experiment (FR-EDT-03): the
 * body of the expanded view's autosave. Only `experiment.md` is written, with
 * `updated` set to now; the frontmatter's other fields, the preamble, unknown
 * sections and the literature block are carried over as they were, unless
 * `options.literature` regenerates the block in the same write (FR-CIT-10).
 *
 * The text is refused, and nothing changes, if it would break the file's
 * structure when read back (a level-2 heading, an unclosed fence, a
 * literature marker — format-v1.md 4.3): the person's words are never lost to
 * a save that would corrupt the file. Nothing is written when the text and
 * block are already what is stored.
 */
export function editExperimentSection(
  state: NotebookState,
  id: string,
  key: RecognisedSectionKey,
  text: string,
  env: NotebookEnv,
  options: SectionEditOptions = {},
): Result<Plan, NotebookError> {
  const found = state.experiments.find((e) => e.file.frontmatter.id === id);
  if (found === undefined) return fail(missingExperiment(id));

  const before =
    found.file.body.sections.find((s) => s.key === key)?.body ?? "";
  const withText = setExperimentSection(found.file.body, key, text);
  if (!withText.ok) return fail(invalid(withText.error.message, "text"));
  const stored = withText.value.sections.find((s) => s.key === key)?.body ?? "";

  // As in `editExperimentLiterature`: nothing cited and no block means no block.
  const leaveBlock =
    options.literature === undefined ||
    (options.literature === "" && found.file.body.literature === null);
  const withBlock =
    leaveBlock || options.literature === undefined
      ? withText
      : setExperimentLiterature(withText.value, options.literature);
  if (!withBlock.ok)
    return fail(invalid(withBlock.error.message, "literature"));
  const sameBlock = withBlock.value.literature === found.file.body.literature;
  return planBodyEdit(
    state,
    found,
    withBlock.value,
    stored === before && sameBlock,
    env,
  );
}

/**
 * Rewrites only the literature block of an experiment (FR-CIT-10), for a
 * change that touches no section text, such as a new citation style. Empty
 * content adds no block where there was none; where there was one it leaves
 * an empty block, so the markers the person may rely on stay in place.
 */
export function editExperimentLiterature(
  state: NotebookState,
  id: string,
  content: string,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const found = state.experiments.find((e) => e.file.frontmatter.id === id);
  if (found === undefined) return fail(missingExperiment(id));
  const held = found.file.body.literature;
  if (held === null && content === "") return ok(noChange(state));
  const next = setExperimentLiterature(found.file.body, content);
  if (!next.ok) return fail(invalid(next.error.message, "literature"));
  return planBodyEdit(
    state,
    found,
    next.value,
    next.value.literature === held,
    env,
  );
}
