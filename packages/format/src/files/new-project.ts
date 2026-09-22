import { fail, ok, type FormatError, type Result } from "../result";
import { COLUMN_KEYS, ProjectYaml, type ProjectYamlModel } from "../schema";
import { zodFailure } from "../zod-error";
import { serialiseProject } from "./project";

/** The clock and identifier source a new project is built with, injected so tests are deterministic. */
export interface ProjectEnv {
  now: () => Date;
  newId: () => string;
}

/** What the person chooses when creating a project, plus the running application's version. */
export interface NewProjectInput {
  name: string;
  appVersion: string;
}

/** A new project's `project.yaml` as a model and as canonical text, and its empty `bibliography.json`. */
export interface NewProjectFiles {
  project: ProjectYamlModel;
  projectYaml: string;
  bibliographyJson: string;
}

/** Spec 5.3 default widths, in CSS pixels, in the order the table shows the columns. */
export const DEFAULT_COLUMN_WIDTHS: Record<
  (typeof COLUMN_KEYS)[number],
  number
> = {
  motivation: 220,
  methods: 260,
  results: 280,
  results_notes: 300,
  interpretation: 320,
  literature: 240,
};

/** An empty CSL-JSON array in the JSON layout of format-v1.md 3.5. */
const EMPTY_BIBLIOGRAPHY = "[]\n";

/** RFC 3339 in UTC with second precision (spec 5.2). */
function timestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Builds the files of a new, empty project from the spec 5.3 defaults
 * (FR-PRJ-01). The result is validated against the schema, so an invalid name,
 * identifier or version is reported rather than written. Nothing here reads a
 * clock or a random source: `env` supplies both.
 */
export function newProject(
  input: NewProjectInput,
  env: ProjectEnv,
): Result<NewProjectFiles, FormatError> {
  const candidate = {
    format_version: 1,
    id: env.newId(),
    name: input.name.trim(),
    created: timestamp(env.now()),
    last_written_by: input.appVersion,
    archived: null,
    locale: "en-GB",
    citation_style: "nature.csl",
    capture: { copy_threshold_mb: 100, evidence_in_git: false },
    numbering: { next_question: 1, next_experiment: 1 },
    order: [],
    table: {
      columns: COLUMN_KEYS.map((key) => ({
        key,
        width: DEFAULT_COLUMN_WIDTHS[key],
        hidden: false,
      })),
      collapsed_questions: [],
    },
    external_roots: [],
  };
  const checked = ProjectYaml.safeParse(candidate);
  if (!checked.success) return fail(zodFailure(checked.error));
  return ok({
    project: checked.data,
    projectYaml: serialiseProject(checked.data),
    bibliographyJson: EMPTY_BIBLIOGRAPHY,
  });
}
