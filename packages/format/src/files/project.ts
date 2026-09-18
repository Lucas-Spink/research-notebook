import type { ProjectYamlModel } from "../schema";
import { fail, type FormatError, type Result } from "../result";

/** Parses `project.yaml`. */
export function parseProject(
  _text: string,
): Result<ProjectYamlModel, FormatError> {
  void _text;
  return fail({ kind: "syntax", message: "not implemented" });
}

/** Writes `project.yaml` in canonical form. */
export function serialiseProject(_project: ProjectYamlModel): string {
  void _project;
  throw new Error("not implemented");
}
