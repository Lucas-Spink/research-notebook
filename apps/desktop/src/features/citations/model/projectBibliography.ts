import type { CitationCluster } from "@research-notebook/format";
import type { LiteratureSetup } from "./literaturePlan";

/**
 * The combined bibliography as formatted entries, in the style's order, and
 * the in-text form of each citation passed in (`null` where none of its
 * sources could be resolved). `unresolved` names the citekeys that are not in
 * `bibliography.json`.
 */
export type ProjectBibliography = {
  entries: readonly string[];
  clusterTexts: readonly (string | null)[];
  unresolved: readonly string[];
};

/**
 * Formats every source cited anywhere in the project as one bibliography
 * (FR-ARC-06). `clusters` is the whole project's citations joined in project
 * order, so this is one fresh citation context: sources are numbered from 1,
 * each is listed once, and an experiment's own Literature block does not
 * decide anything. `null` when the engine or style fails, or no engine is
 * available, so the caller can refuse to write a PDF without it.
 */
export async function formatProjectBibliography(
  setup: LiteratureSetup,
  clusters: readonly CitationCluster[],
): Promise<ProjectBibliography | null> {
  try {
    const result = await setup.render({
      clusters,
      items: setup.items,
      styleXml: setup.styleXml,
      localeXml: setup.localeXml,
    });
    return result.ok
      ? {
          entries: result.value.entries,
          clusterTexts: result.value.clusterTexts,
          unresolved: result.value.unresolved,
        }
      : null;
  } catch {
    return null;
  }
}
