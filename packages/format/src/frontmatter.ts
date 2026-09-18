import type { z } from "zod";
import { readYaml } from "./yaml/read";
import { writeYaml } from "./yaml/write";
import { orderByShape, type Shape } from "./key-order";
import { fail, ok, type FormatError, type Result } from "./result";
import { normaliseText } from "./text";
import { zodFailure } from "./zod-error";

const FENCE = "---";

/**
 * Splits a Markdown file into its YAML frontmatter and the text after it
 * (format-v1.md 4.3): line 1 is exactly `---` and the frontmatter ends at
 * the next line that is exactly `---`. Input must already be normalised.
 */
export function splitFrontmatter(
  text: string,
): Result<{ yaml: string; body: string }, FormatError> {
  const lines = text.split("\n");
  if (lines[0] !== FENCE) {
    return fail({
      kind: "frontmatter",
      message: "missing opening frontmatter fence: line 1 must be exactly ---",
    });
  }
  const closing = lines.indexOf(FENCE, 1);
  if (closing === -1) {
    return fail({
      kind: "frontmatter",
      message: "missing closing frontmatter fence: no line is exactly ---",
    });
  }
  return ok({
    yaml: lines.slice(1, closing).join("\n"),
    body: lines.slice(closing + 1).join("\n"),
  });
}

/**
 * Parses a Markdown file whose frontmatter matches `schema`. Returns the
 * validated frontmatter and the raw text after the closing fence.
 */
export function parseFrontmatterFile<S extends z.ZodType>(
  input: string,
  schema: S,
): Result<{ frontmatter: z.output<S>; body: string }, FormatError> {
  const split = splitFrontmatter(normaliseText(input));
  if (!split.ok) return split;
  const yaml = readYaml(split.value.yaml);
  if (!yaml.ok) return yaml;
  const checked = schema.safeParse(yaml.value);
  if (!checked.success) return fail(zodFailure(checked.error));
  return ok({ frontmatter: checked.data, body: split.value.body });
}

/**
 * Writes frontmatter in canonical key order followed by the body blocks:
 * `---`, the YAML, `---`, then a blank line, the blocks and one final LF.
 * An empty `blocks` writes only the fences (format-v1.md 4.2).
 */
export function writeFrontmatterFile(
  frontmatter: unknown,
  shape: Shape,
  blocks: string,
): string {
  const yaml = writeYaml(orderByShape(frontmatter, shape));
  const head = `${FENCE}\n${yaml}${FENCE}\n`;
  return blocks === "" ? head : `${head}\n${blocks}\n`;
}
