import { scanCitations } from "../editor";

/**
 * Hands the exports the formatted in-text form of each citation, one at a
 * time, in the order the citations appear in the output. The texts come from
 * the citation engine over the same sequence (`exportSections`), so the nth
 * citation drawn here is the nth cluster the engine formatted. Both the HTML
 * and the PDF export draw from one, so they cannot disagree about a citation.
 */
export interface CitationCursor {
  /** The next citation's text, or `null` when it could not be resolved. */
  next(): string | null;
  /** Passes over citations that are shown as written (raw passthrough text). */
  skip(count: number): void;
}

/** A cursor over `texts`, one per cluster in output order. */
export function citationCursor(
  texts: readonly (string | null)[],
): CitationCursor {
  let position = 0;
  return {
    next() {
      const text = texts[position] ?? null;
      position += 1;
      return text;
    },
    skip(count) {
      position += count;
    },
  };
}

/** How many citations the editor's parser finds in text shown as written. */
export function citationsIn(markdown: string): number {
  return scanCitations(markdown).length;
}

/** What shows in place of a citation that could not be resolved. */
export function unresolvedMarker(citekeys: readonly string[]): string {
  return `[${citekeys.join("; ")}?]`;
}
