import type { QuestionFrontmatterModel } from "../schema";
import { fail, type FormatError, type Result } from "../result";

/** A parsed `questions/<ref>.md`: frontmatter plus the Motivation as Markdown. */
export interface QuestionFile {
  frontmatter: QuestionFrontmatterModel;
  body: string;
}

/** Parses a question file. */
export function parseQuestion(
  _text: string,
): Result<QuestionFile, FormatError> {
  void _text;
  return fail({ kind: "frontmatter", message: "not implemented" });
}

/** Writes a question file in canonical form. */
export function serialiseQuestion(_question: QuestionFile): string {
  void _question;
  throw new Error("not implemented");
}
