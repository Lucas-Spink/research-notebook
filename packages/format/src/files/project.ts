import { PROJECT_SHAPE, orderByShapeAsMaps } from "../key-order";
import { fail, ok, type FormatError, type Result } from "../result";
import {
  FormatVersionProbe,
  ProjectYaml,
  type ProjectYamlModel,
} from "../schema";
import { normaliseText } from "../text";
import { readYaml } from "../yaml/read";
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

/**
 * Reads only `format_version` from the text of `project.yaml`, or `null` when
 * the text is not YAML or has no usable version. This is how an older project
 * is told apart from an invalid one, because the full schema accepts only the
 * current version (spec 5.13, ADR-0064). Nothing else in the file is checked.
 */
export function projectFormatVersion(text: string): number | null {
  const yaml = readYaml(normaliseText(text));
  if (!yaml.ok) return null;
  const probe = FormatVersionProbe.safeParse(yaml.value);
  return probe.success ? probe.data.format_version : null;
}

/** Writes `project.yaml` in canonical form. */
export function serialiseProject(project: ProjectYamlModel): string {
  return writeYaml(orderByShapeAsMaps(project, PROJECT_SHAPE), FLOW_PATHS);
}

/** Why an external root could not be added; see `addExternalRoot`. */
export type AddExternalRootError =
  /** The label was empty once surrounding whitespace was trimmed. */
  | { kind: "emptyLabel" }
  /** Another of the project's external roots already has this label. */
  | { kind: "duplicateLabel" }
  /** The label does not fit `project.yaml`'s schema, for example it has a line break. */
  | { kind: "invalidLabel" };

export type AddedExternalRoot = {
  project: ProjectYamlModel;
  root: { id: string; label: string };
};

/**
 * Adds a new external root labelled `label` to `project`, so evidence
 * outside the project folder can be captured under it once its folder is set
 * on this machine (FR-PRJ-07). The label is trimmed and must be unique among
 * the project's roots, so choosing one by label is never ambiguous. The path
 * is not part of `project.yaml`: it is recorded separately, per machine
 * (spec 5.3).
 */
export function addExternalRoot(
  project: ProjectYamlModel,
  label: string,
  env: { newId: () => string; appVersion: string },
): Result<AddedExternalRoot, AddExternalRootError> {
  const trimmed = label.trim();
  if (trimmed.length === 0) return fail({ kind: "emptyLabel" });
  if (project.external_roots.some((root) => root.label === trimmed)) {
    return fail({ kind: "duplicateLabel" });
  }
  const root = { id: env.newId(), label: trimmed };
  const next = {
    ...project,
    external_roots: [...project.external_roots, root],
    last_written_by: env.appVersion,
  };
  const checked = ProjectYaml.safeParse(next);
  if (!checked.success) return fail({ kind: "invalidLabel" });
  return ok({ project: checked.data, root });
}
