import type { BibliographyFileModel } from "@research-notebook/format";
import { sourceDetails, type SourceDetails } from "./sourceDetails";

type Item = BibliographyFileModel[number];

/** Authors as a reference list gives them: all of them, joined. */
function authorsText(authors: readonly string[]): string {
  if (authors.length <= 2) return authors.join(" and ");
  return `${authors.slice(0, -1).join(", ")} and ${authors[authors.length - 1] ?? ""}`;
}

/** A sentence-final stop, unless the text already ends in one. */
function stopped(text: string): string {
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

/**
 * One source as a line of a reference list: authors, year, title, where it
 * was published and its DOI, read only from the cached CSL-JSON (FR-CIT-06).
 * It is a readable reference for the Bibliography panel and the hover
 * preview, not a style-driven rendering, which stays the Literature block's
 * job (FR-CIT-10).
 */
export function bibliographyEntry(details: SourceDetails): string {
  const lead = [
    details.authors.length > 0 ? authorsText(details.authors) : null,
    details.year === null ? null : `(${details.year})`,
  ]
    .filter((part) => part !== null)
    .join(" ");
  return [
    lead === "" ? null : stopped(lead),
    stopped(details.title),
    details.container === null ? null : stopped(details.container),
    details.doi === null ? null : `https://doi.org/${details.doi}`,
  ]
    .filter((part) => part !== null)
    .join(" ");
}

/** An entry of the Bibliography panel. */
export type BibliographyRow = {
  citekey: string;
  /** The reference line, or `null` when the source is not in `bibliography.json`. */
  details: SourceDetails | null;
  text: string;
};

/**
 * The reference list for `citekeys`, which are the sources cited in the
 * project: each one's entry, in author order, and for one that is cited but
 * absent from the cache, a row that says so under its citekey rather than
 * hiding it.
 */
export function bibliographyRows(
  citekeys: Iterable<string>,
  items: readonly Item[],
  missingText: (citekey: string) => string,
): BibliographyRow[] {
  const byKey = new Map(items.map((item) => [item.id, item] as const));
  return [...new Set(citekeys)]
    .map((citekey): BibliographyRow => {
      const item = byKey.get(citekey);
      if (item === undefined)
        return { citekey, details: null, text: missingText(citekey) };
      const details = sourceDetails(item);
      return { citekey, details, text: bibliographyEntry(details) };
    })
    .sort((a, b) =>
      a.text.localeCompare(b.text, "en", { sensitivity: "base" }),
    );
}
