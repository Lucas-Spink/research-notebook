/**
 * The rows to render: those in view, plus the pinned one (the row being
 * edited, ADR-0043) wherever it is, so scrolling never unmounts its editor.
 * `inView` is ascending, as TanStack Virtual's range extractor returns it.
 */
export function withPinned(
  inView: readonly number[],
  pinned: number | null,
): number[] {
  if (pinned === null || inView.includes(pinned)) return [...inView];
  return [...inView, pinned].sort((a, b) => a - b);
}
