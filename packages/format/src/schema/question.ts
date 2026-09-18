import { z } from "zod";
import { QuestionRef, SingleLine, Timestamp, Ulid } from "./common";

/**
 * Spec 5.4: frontmatter of `questions/<ref>.md`. The Markdown body is the
 * Motivation and has no schema; it is preserved as written.
 */
export const QuestionFrontmatter = z.looseObject({
  id: Ulid,
  ref: QuestionRef,
  title: SingleLine,
  created: Timestamp,
});

export type QuestionFrontmatterModel = z.infer<typeof QuestionFrontmatter>;
