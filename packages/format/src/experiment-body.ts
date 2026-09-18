import type { ExperimentBodyModel } from "./schema";
import { fail, type FormatError, type Result } from "./result";

/**
 * Parses the Markdown after an experiment's frontmatter (format-v1.md 4.3).
 * `text` has already been normalised to LF.
 */
export function parseExperimentBody(
  _text: string,
): Result<ExperimentBodyModel, FormatError> {
  void _text;
  return fail({ kind: "body", message: "not implemented" });
}

/**
 * Writes the canonical body blocks, separated by one blank line and with no
 * final newline. Empty when there are no blocks.
 *
 * Precondition: the text of every block obeys the grammar (no level-2
 * heading or literature marker outside a fence, every fence closed).
 * Section text typed by a user must be checked before it is stored here.
 */
export function serialiseExperimentBody(_body: ExperimentBodyModel): string {
  void _body;
  throw new Error("not implemented");
}
