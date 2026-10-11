import type { CitationCluster } from "@research-notebook/format";

/** The project's citations as the citation engine formatted them (issue #102). */
export type FormattedCitations = {
  /** One formatted bibliography entry each, as Markdown, in the style's order. */
  entries: readonly string[];
  /** The in-text form of each citation passed in; `null` where none of its sources could be resolved. */
  clusterTexts: readonly (string | null)[];
  /** Citekeys cited but not in `bibliography.json`, in order of first appearance. */
  unresolved: readonly string[];
};

/**
 * Formats every citation of the project as one citation context, with a fresh
 * numbering (FR-ARC-06). `null` when it could not be formatted.
 */
export type FormatBibliography = (
  clusters: readonly CitationCluster[],
) => Promise<FormattedCitations | null>;
