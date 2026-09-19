import { fail, type FormatError, type Result } from "../result";
import type { ProjectYamlModel } from "../schema";

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

export function newProject(
  input: NewProjectInput,
  env: ProjectEnv,
): Result<NewProjectFiles, FormatError> {
  void input;
  void env;
  return fail({ kind: "syntax", message: "not implemented" });
}
