import type { NotebookState } from "./types";

type Prefix = "Q" | "EXP";

/** Digits only, and short enough to be a safe integer. */
function numberIn(prefix: Prefix | "any", text: string): number | null {
  const match = /^(Q|EXP)-(\d{1,15})$/.exec(text);
  if (match === null) return null;
  return prefix === "any" || match[1] === prefix ? Number(match[2]) : null;
}

/**
 * The number in a ref such as `Q-003` or `EXP-042`, or `null` for any other
 * text. Leading zeros beyond three, which the format does not allow, are read
 * all the same: a folder named `EXP-0042` still occupies the number.
 */
export function refNumber(ref: string): number | null {
  return numberIn("any", ref);
}

/** A ref with at least three digits and no leading zeros beyond three (format-v1.md section 2). */
export function formatRef(prefix: Prefix, number: number): string {
  return `${prefix}-${String(number).padStart(3, "0")}`;
}

function withoutMarkdownExtension(fileName: string): string {
  return fileName.replace(/\.md$/, "");
}

/**
 * The number the next question or experiment is given: the counter in
 * `project.yaml`, or one more than the highest number held by any file or
 * folder, whichever is larger (format-v1.md section 5). The counter is only
 * ever raised, so the ref of something deleted is not given out again
 * (FR-EXP-03).
 */
export function nextRefNumber(
  kind: "question" | "experiment",
  state: NotebookState,
): number {
  const prefix: Prefix = kind === "question" ? "Q" : "EXP";
  const counter =
    kind === "question"
      ? state.project.numbering.next_question
      : state.project.numbering.next_experiment;
  const held =
    kind === "question"
      ? state.questions.flatMap((q) => [
          q.file.frontmatter.ref,
          withoutMarkdownExtension(q.fileName),
        ])
      : state.experiments.flatMap((e) => [e.file.frontmatter.ref, e.folder]);
  let highest = 0;
  for (const text of [...held, ...state.reservedRefs]) {
    highest = Math.max(highest, numberIn(prefix, text) ?? 0);
  }
  return Math.max(counter, highest + 1);
}
