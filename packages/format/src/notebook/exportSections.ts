import { citationClusters, type CitationCluster } from "../editor";
import type { ArrangedExperiment, ArrangedQuestion } from "./arrange";
import { citationCursor, type CitationCursor } from "./exportCitations";

/** What the exports include and what they name as left out. */
export type Exported = {
  questions: ArrangedQuestion[];
  experiments: ArrangedExperiment[];
  skipped: string[];
};

/** One stored Markdown text the exports show, with the name its citations are looked up by. */
export interface ExportSection {
  key: string;
  markdown: string;
}

/** The key of a question's Motivation. */
export const motivationKey = (ref: string): string =>
  `question:${ref}:motivation`;
/** The key of the text before an experiment's first section. */
export const preambleKey = (ref: string): string =>
  `experiment:${ref}:preamble`;
/** The key of an experiment's section, by its place in the file. */
export const sectionKey = (ref: string, index: number): string =>
  `experiment:${ref}:section:${index}`;

/**
 * Every text with citations that the exports show, in one fixed order:
 * Motivations, then each experiment's preamble and sections as stored. The
 * citation engine formats the citations of this sequence once, so the HTML and
 * the PDF number and word them identically however each lays its pages out.
 */
export function exportSections(shown: Exported): ExportSection[] {
  const sections: ExportSection[] = shown.questions.map((q) => ({
    key: motivationKey(q.question.file.frontmatter.ref),
    markdown: q.question.file.body,
  }));
  for (const item of shown.experiments) {
    const { frontmatter, body } = item.experiment.file;
    sections.push({
      key: preambleKey(frontmatter.ref),
      markdown: body.preamble,
    });
    body.sections.forEach((section, index) => {
      sections.push({
        key: sectionKey(frontmatter.ref, index),
        markdown: section.body,
      });
    });
  }
  return sections;
}

/**
 * The citations of the whole export in `exportSections` order, as one citation
 * context (FR-ARC-06). Unlike an experiment's Literature block (FR-CIT-09),
 * Results notes count here, because the export shows them.
 */
export function exportCitationClusters(shown: Exported): CitationCluster[] {
  return exportSections(shown).flatMap((s) => citationClusters(s.markdown));
}

/**
 * Splits the engine's texts (one per cluster of `exportCitationClusters`)
 * among the sections, and returns a way to draw each section's own. A key that
 * names no section draws nothing.
 */
export function sectionCitations(
  shown: Exported,
  texts: readonly (string | null)[],
): (key: string) => CitationCursor {
  const slices = new Map<string, readonly (string | null)[]>();
  let at = 0;
  for (const section of exportSections(shown)) {
    const count = citationClusters(section.markdown).length;
    slices.set(section.key, texts.slice(at, at + count));
    at += count;
  }
  return (key) => citationCursor(slices.get(key) ?? []);
}
