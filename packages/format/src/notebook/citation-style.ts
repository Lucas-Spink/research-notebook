import { fail, ok, type Result } from "../result";
import { FileName } from "../schema";
import {
  checkedProject,
  invalid,
  noChange,
  projectStep,
  stamped,
} from "./project-edit";
import { editExperimentLiterature } from "./sections";
import {
  PROJECT_PATH,
  type NotebookEnv,
  type NotebookError,
  type NotebookState,
  type Plan,
  type Step,
} from "./types";

/** What choosing a citation style changes (FR-CIT-10, FR-CIT-11). */
export interface CitationStyleChange {
  /** The file in `styles/` that becomes `citation_style`, such as `nature.csl`. */
  file: string;
  /** The style's text, to be created in `styles/` as `file`, which must not exist yet. */
  copy?: string;
  /** Experiment ID to the Literature block it gets under the new style. */
  literature?: Readonly<Record<string, string>>;
}

/**
 * Plans a change of citation style as one ordered plan: the style file if it
 * is being copied in, then each experiment's regenerated Literature block,
 * then `project.yaml` once, last (ADR-0026), so a stop half-way never leaves
 * `project.yaml` naming a style that is not in `styles/`. Section text is
 * never touched. Choosing the style already named still rewrites the blocks
 * given, which is how a person regenerates them.
 */
export function changeCitationStyle(
  state: NotebookState,
  change: CitationStyleChange,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const named = FileName.safeParse(change.file);
  if (!named.success || !change.file.endsWith(".csl")) {
    return fail(
      invalid("a citation style is a .csl file name", "citation_style"),
    );
  }
  const steps: Step[] = [];
  if (change.copy !== undefined) {
    steps.push({
      kind: "create",
      path: `_notebook/styles/${change.file}`,
      text: change.copy,
    });
  }
  let next = state;
  for (const [id, content] of Object.entries(change.literature ?? {})) {
    const planned = editExperimentLiterature(next, id, content, env);
    if (!planned.ok) return planned;
    steps.push(...planned.value.steps.filter((s) => s.path !== PROJECT_PATH));
    next = planned.value.next;
  }
  const renamed = change.file !== state.project.citation_style;
  if (!renamed && steps.length === 0) return ok(noChange(state));

  const project = checkedProject(
    stamped({ ...next.project, citation_style: change.file }, env),
  );
  if (!project.ok) return project;
  // Regenerating under the style already named leaves project.yaml alone,
  // unless an experiment's write has already moved its writer stamp.
  const projectChanged =
    renamed || project.value.last_written_by !== state.project.last_written_by;
  return ok({
    steps: projectChanged ? [...steps, projectStep(project.value)] : steps,
    next: { ...next, project: project.value },
  });
}
