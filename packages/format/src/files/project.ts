import { PROJECT_SHAPE, orderByShapeAsMaps } from "../key-order";
import type { FormatError, Result } from "../result";
import { ProjectYaml, type ProjectYamlModel } from "../schema";
import { writeYaml } from "../yaml/write";
import { parseYamlFile } from "./read";

/** Table columns are the one list of objects written in flow style (format-v1.md 3.4). */
const FLOW_PATHS = ["table.columns.*"];

/** Parses `project.yaml`. Unknown keys are kept at every level. */
export function parseProject(
  text: string,
): Result<ProjectYamlModel, FormatError> {
  return parseYamlFile(text, ProjectYaml);
}

/** Writes `project.yaml` in canonical form. */
export function serialiseProject(project: ProjectYamlModel): string {
  return writeYaml(orderByShapeAsMaps(project, PROJECT_SHAPE), FLOW_PATHS);
}
