/** The part of the arranged notebook the canvas's tabs need. */
type ArrangedLike = {
  questions: {
    question: {
      fileName: string;
      file: { frontmatter: { id: string; ref: string; title: string } };
    };
  }[];
};

/** A question as a tab of the canvas view: which file it is, its id (which names its canvas) and its label. */
export type CanvasQuestionTab = { key: string; id: string; label: string };

/** One tab for each question, in order (ADR-0065). Experiments no question holds have no canvas. */
export function questionsOf(arranged: ArrangedLike): CanvasQuestionTab[] {
  return arranged.questions.map(({ question }) => ({
    key: question.fileName,
    id: question.file.frontmatter.id,
    label: `${question.file.frontmatter.ref} ${question.file.frontmatter.title}`,
  }));
}

/** The question to show: the one chosen if it is still there, else the first, else none. */
export function reconcileQuestion(
  chosen: string | null,
  tabs: readonly CanvasQuestionTab[],
): string | null {
  if (chosen !== null && tabs.some((tab) => tab.key === chosen)) return chosen;
  return tabs[0]?.key ?? null;
}
