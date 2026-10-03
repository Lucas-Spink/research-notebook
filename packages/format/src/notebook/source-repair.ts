import { replaceCitekey } from "../editor";
import { RECOGNISED_SECTIONS, Citekey } from "../schema";
import { fail, ok, type Result } from "../result";
import { editExperimentSection } from "./sections";
import {
  invalid,
  missingExperiment,
  noChange,
  projectStep,
} from "./project-edit";
import {
  PROJECT_PATH,
  type NotebookEnv,
  type NotebookError,
  type NotebookState,
  type Plan,
  type Step,
} from "./types";

/** What replacing one source with another changes (FR-CIT-08). */
export interface SourceReplacement {
  /** The citekey being replaced, the missing or trashed source's. */
  from: string;
  /** The citekey of the item that takes its place. */
  to: string;
  /** Experiment ID to the Literature block it gets once cited sources have changed. */
  literature?: Readonly<Record<string, string>>;
}

/** Whether `key` is a recognised section's key, with the type that says so. */
function recognised(key: string): key is (typeof RECOGNISED_SECTIONS)[number] {
  return RECOGNISED_SECTIONS.some((known) => known === key);
}

/**
 * Plans replacing a source's citekey in the text of every experiment that
 * cites it (FR-CIT-08): each recognised section's citations of `from` point at
 * `to`, and no other byte of the text changes (`replaceCitekey`). An
 * experiment's Literature block is saved in the same write as its text when
 * one is given, and left alone otherwise. Experiments that do not cite `from`
 * are not written. Nothing here touches `bibliography.json`: the new source
 * is added first and the old entry is kept (spec 5.9).
 *
 * Each experiment is one write and `project.yaml` is written last, once, so a
 * stop half-way leaves every experiment either as it was or fully rewritten,
 * and running the same replacement again finishes the job. Nothing is
 * written, and no state changes, when no experiment cites `from`.
 */
export function replaceSource(
  state: NotebookState,
  change: SourceReplacement,
  env: NotebookEnv,
): Result<Plan, NotebookError> {
  const { from, to } = change;
  if (!Citekey.safeParse(from).success || !Citekey.safeParse(to).success) {
    return fail(invalid("a source is named by a citekey", "citekey"));
  }
  if (from === to) {
    return fail(invalid("a source cannot replace itself", "citekey"));
  }
  const known = new Set(state.experiments.map((e) => e.file.frontmatter.id));
  for (const id of Object.keys(change.literature ?? {})) {
    if (!known.has(id)) return fail(missingExperiment(id));
  }

  const steps: Step[] = [];
  let next = state;
  for (const experiment of state.experiments) {
    const id = experiment.file.frontmatter.id;
    const edits = experiment.file.body.sections.flatMap((section) => {
      if (!recognised(section.key)) return [];
      const text = replaceCitekey(section.body, from, to);
      return text === section.body ? [] : [{ key: section.key, text }];
    });
    const lastIndex = edits.length - 1;
    for (const [index, edit] of edits.entries()) {
      const block = change.literature?.[id];
      const planned = editExperimentSection(
        next,
        id,
        edit.key,
        edit.text,
        env,
        {
          ...(index === lastIndex && block !== undefined
            ? { literature: block }
            : {}),
        },
      );
      if (!planned.ok) return planned;
      steps.push(...planned.value.steps.filter((s) => s.path !== PROJECT_PATH));
      next = planned.value.next;
    }
  }
  if (steps.length === 0) return ok(noChange(state));

  // An experiment edited twice has two writes of one path; only the last holds everything.
  const last = new Map(steps.map((step) => [step.path, step] as const));
  const ordered = steps.filter((step) => last.get(step.path) === step);
  const projectChanged = next.project !== state.project;
  return ok({
    steps: projectChanged ? [...ordered, projectStep(next.project)] : ordered,
    next,
  });
}
