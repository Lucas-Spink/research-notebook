/**
 * The rows to render: those in view, plus the pinned ones (the row being
 * edited and the row holding keyboard focus, ADR-0043) wherever they are,
 * so scrolling never unmounts an editor or the grid's one tab stop.
 * `inView` is ascending, as TanStack Virtual's range extractor returns it.
 */
export function withPinned(
  inView: readonly number[],
  pinned: readonly number[],
): number[] {
  return [...new Set([...inView, ...pinned])].sort((a, b) => a - b);
}
