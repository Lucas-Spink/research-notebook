/** One schema problem, located by a dotted path such as `order.0.question`. */
export interface SchemaIssue {
  path: string;
  message: string;
}

/**
 * Why a notebook file could not be read. Messages are diagnostics for
 * developers and logs, not user-facing text (AGENTS.md section 5). A file
 * that fails to parse must be left untouched and opened read-only
 * (AGENTS.md section 2, rule 5).
 */
export type FormatError =
  /** The text is not valid YAML or JSON, or uses a construct the format forbids. */
  | { kind: "syntax"; message: string; line?: number }
  /** A Markdown file has no valid `---` frontmatter fence. */
  | { kind: "frontmatter"; message: string }
  /** The Markdown body breaks a rule of format-v1.md section 4.3. */
  | { kind: "body"; message: string; line?: number }
  /** The content parsed but does not match the schema. */
  | { kind: "schema"; message: string; issues: SchemaIssue[] }
  /** `format_version` is newer than this build understands (spec 5.13 rule 2). */
  | { kind: "unsupported-version"; message: string; found: number };

/** Expected failures are values, not exceptions. */
export type Result<T, E = FormatError> =
  { ok: true; value: T } | { ok: false; error: E };

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function fail<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
