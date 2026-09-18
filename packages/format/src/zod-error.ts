import type { z } from "zod";
import type { FormatError } from "./result";

/** Converts a Zod failure into the format's typed schema error. */
export function zodFailure(error: z.ZodError): FormatError {
  const issues = error.issues.map((issue) => ({
    path: issue.path.map(String).join("."),
    message: issue.message,
  }));
  const first = issues[0];
  const where =
    first === undefined || first.path === "" ? "" : ` at ${first.path}`;
  return {
    kind: "schema",
    message: `${issues.length} schema problem(s)${where}: ${first?.message ?? "invalid"}`,
    issues,
  };
}
