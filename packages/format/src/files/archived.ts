import type { ProjectYamlModel } from "../schema";

/** Seconds precision, as every `project.yaml` timestamp is (format-v1.md 2). */
function timestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * Marks a project archived (FR-ARC-09). The flag is the only key that
 * changes: archiving does not claim to have written the project's records,
 * so `last_written_by` stays (spec 6.3).
 */
export function markArchived(
  project: ProjectYamlModel,
  now: () => Date,
): ProjectYamlModel {
  return { ...project, archived: timestamp(now()) };
}

/**
 * Returns an archived project to active use (FR-ARC-10). The running version
 * becomes the last writer because unarchiving is followed by a migration and
 * ordinary writes by this build.
 */
export function markUnarchived(
  project: ProjectYamlModel,
  appVersion: string,
): ProjectYamlModel {
  return { ...project, archived: null, last_written_by: appVersion };
}
