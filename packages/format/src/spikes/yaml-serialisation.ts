import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

/**
 * Spike for S1-T08: proves the `yaml` library can write double-quoted
 * strings in a documented key order while preserving unknown keys (spec
 * 5.2, 5.3). This is spike evidence, not the production parser — that is
 * built in packages/format under S2-T01/S2-T02 after the format document
 * is approved.
 */

const PROJECT_YAML_KEY_ORDER = [
  "format_version",
  "id",
  "name",
  "created",
  "last_written_by",
  "archived",
  "locale",
  "citation_style",
  "capture",
  "numbering",
  "order",
  "table",
  "external_roots",
];

const NESTED_KEY_ORDER: Readonly<Record<string, readonly string[]>> = {
  capture: ["copy_threshold_mb", "evidence_in_git"],
  numbering: ["next_question", "next_experiment"],
  table: ["columns", "collapsed_questions"],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Known keys first, in the given order; any remaining (unknown) keys
 * follow afterwards in their original relative order.
 */
function orderKeys(
  data: Record<string, unknown>,
  order: readonly string[],
): Record<string, unknown> {
  const ordered: Record<string, unknown> = {};
  for (const key of order) {
    if (key in data) ordered[key] = data[key];
  }
  for (const key of Object.keys(data)) {
    if (!(key in ordered)) ordered[key] = data[key];
  }
  return ordered;
}

function orderProjectYamlFields(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const ordered = orderKeys(data, PROJECT_YAML_KEY_ORDER);
  for (const [key, nestedOrder] of Object.entries(NESTED_KEY_ORDER)) {
    const nested = ordered[key];
    if (isRecord(nested)) {
      ordered[key] = orderKeys(nested, nestedOrder);
    }
  }
  return ordered;
}

export function serialiseProjectYaml(data: Record<string, unknown>): string {
  const ordered = orderProjectYamlFields(data);
  return stringifyYaml(ordered, {
    defaultStringType: "QUOTE_DOUBLE",
    defaultKeyType: "PLAIN",
  });
}

export function parseProjectYaml(source: string): Record<string, unknown> {
  const parsed: unknown = parseYaml(source);
  if (!isRecord(parsed)) {
    throw new Error("expected project.yaml to parse to a mapping");
  }
  return parsed;
}
