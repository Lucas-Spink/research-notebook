import { parseFrontmatterFile, writeFrontmatterFile } from "../frontmatter";
import { QUESTION_SHAPE } from "../key-order";
import { ok, type FormatError, type Result } from "../result";
import { QuestionFrontmatter, type QuestionFrontmatterModel } from "../schema";
import { trimBlankLines } from "../text";

/** A parsed `questions/<ref>.md`: frontmatter plus the Motivation as Markdown. */
export interface QuestionFile {
  frontmatter: QuestionFrontmatterModel;
  /** Preserved as written apart from line endings and blank lines at either end. */
  body: string;
}

/** Parses a question file. */
export function parseQuestion(text: string): Result<QuestionFile, FormatError> {
  const parsed = parseFrontmatterFile(text, QuestionFrontmatter);
  if (!parsed.ok) return parsed;
  return ok({
    frontmatter: parsed.value.frontmatter,
    body: trimBlankLines(parsed.value.body),
  });
}

/** Writes a question file in canonical form. */
export function serialiseQuestion(question: QuestionFile): string {
  return writeFrontmatterFile(
    question.frontmatter,
    QUESTION_SHAPE,
    question.body,
  );
}
