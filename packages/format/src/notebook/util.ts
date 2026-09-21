import type { z } from "zod";
import { invalid } from "./project-edit";
import type { NotebookError } from "./types";

/** RFC 3339 in UTC with second precision, the `timestamp` type (format-v1.md section 2). */
export function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/**
 * The first schema problem as a refusal that names the field, so the person
 * is told which value to fix. The message is a diagnostic, not display text.
 */
export function refusal(error: z.ZodError): NotebookError {
  const first = error.issues[0];
  const field = first?.path[0];
  return invalid(
    first === undefined ? "invalid value" : first.message,
    typeof field === "string" ? field : undefined,
  );
}
