import type { z } from "zod";
import { fail, ok, type FormatError, type Result } from "../result";
import { FORMAT_VERSION, FormatVersionProbe } from "../schema";
import { normaliseText } from "../text";
import { readYaml } from "../yaml/read";
import { zodFailure } from "../zod-error";

/**
 * A `format_version` above this build's is reported before anything else is
 * validated, because a newer file's shape cannot be known (spec 5.13 rule 2).
 */
function newerVersion(value: unknown): FormatError | null {
  const probe = FormatVersionProbe.safeParse(value);
  if (!probe.success || probe.data.format_version <= FORMAT_VERSION)
    return null;
  return {
    kind: "unsupported-version",
    message: `format version ${probe.data.format_version} is newer than the supported version ${FORMAT_VERSION}`,
    found: probe.data.format_version,
  };
}

function validate<S extends z.ZodType>(
  value: unknown,
  schema: S,
): Result<z.output<S>, FormatError> {
  const newer = newerVersion(value);
  if (newer !== null) return fail(newer);
  const checked = schema.safeParse(value);
  return checked.success ? ok(checked.data) : fail(zodFailure(checked.error));
}

/** Reads a whole-file YAML document (`project.yaml`, `artefacts.yaml`). */
export function parseYamlFile<S extends z.ZodType>(
  text: string,
  schema: S,
): Result<z.output<S>, FormatError> {
  const yaml = readYaml(normaliseText(text));
  return yaml.ok ? validate(yaml.value, schema) : yaml;
}

/** Reads a JSON file (`request.json`). */
export function parseJsonFile<S extends z.ZodType>(
  text: string,
  schema: S,
): Result<z.output<S>, FormatError> {
  let value: unknown;
  try {
    value = JSON.parse(normaliseText(text));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return fail({ kind: "syntax", message: `invalid JSON: ${reason}` });
  }
  return validate(value, schema);
}
