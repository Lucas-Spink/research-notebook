import { citationContext } from "../editor";
import type { Arranged } from "./arrange";

/** One experiment that cites a source (FR-CIT-12). */
export interface CitedByLocation {
  experimentFolder: string;
  experimentRef: string;
  experimentTitle: string;
}

/** Every cited citekey and the experiments citing it, in project order. */
export type CitedByIndex = ReadonlyMap<string, readonly CitedByLocation[]>;

/**
 * The experiments citing each source (FR-CIT-12), built once from `arranged`
 * the way `buildReferenceIndex` is (ADR-0049, continuing ADR-0042). It reads
 * each experiment's citation context (Methods then Interpretation, FR-CIT-09),
 * the same text the Literature block is built from, so the two never disagree
 * about what counts as a citation. An experiment appears once per source
 * however many times it cites it.
 */
export function buildCitedByIndex(arranged: Arranged): CitedByIndex {
  const index = new Map<string, CitedByLocation[]>();
  const items = [
    ...arranged.questions.flatMap((question) => question.experiments),
    ...arranged.unassigned,
  ];
  for (const { experiment } of items) {
    const { ref, title } = experiment.file.frontmatter;
    const location: CitedByLocation = {
      experimentFolder: experiment.folder,
      experimentRef: ref,
      experimentTitle: title,
    };
    const keys = new Set(
      citationContext(experiment.file.body).flatMap((cluster) =>
        cluster.items.map((item) => item.citekey),
      ),
    );
    for (const citekey of keys) {
      const list = index.get(citekey);
      if (list === undefined) index.set(citekey, [location]);
      else list.push(location);
    }
  }
  return index;
}

/** The experiments citing `citekey`, or an empty list for a source nothing cites. */
export function citedBy(
  index: CitedByIndex,
  citekey: string,
): readonly CitedByLocation[] {
  return index.get(citekey) ?? [];
}
