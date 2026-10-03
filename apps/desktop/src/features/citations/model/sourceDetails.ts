import type { BibliographyFileModel } from "@research-notebook/format";

type Item = BibliographyFileModel[number];

/** What the source details panel shows of one cached source (FR-CIT-04). */
export type SourceDetails = {
  citekey: string;
  title: string;
  authors: string[];
  year: string | null;
  container: string | null;
  /** A bare, link-safe DOI, or `null` when there is none or it cannot be linked. */
  doi: string | null;
  library: string;
  key: string;
  status: Item["_zotero"]["status"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

function authorName(author: unknown): string | null {
  if (!isRecord(author)) return null;
  const literal = nonEmpty(author.literal);
  if (literal !== null) return literal;
  return (
    [nonEmpty(author.given), nonEmpty(author.family)]
      .filter((part) => part !== null)
      .join(" ") || null
  );
}

function year(issued: unknown): string | null {
  if (!isRecord(issued)) return null;
  const parts = issued["date-parts"];
  const first: unknown = Array.isArray(parts) ? parts[0] : undefined;
  const value: unknown = Array.isArray(first) ? first[0] : undefined;
  return typeof value === "number" || typeof value === "string"
    ? String(value)
    : null;
}

const DOI_URL_PREFIX = /^(?:https?:\/\/(?:dx\.)?doi\.org\/|doi:)/i;

/**
 * Mirrors `nb_zotero::links::doi_uri`: a registrant of 4 to 9 digits and a
 * suffix from a deliberately narrow set. The DOI reaches `cmd /C start` on
 * Windows, so a DOI outside the set gets no link rather than an escaped one.
 */
const SAFE_DOI = /^10\.\d{4,9}\/[A-Za-z0-9._;()/:-]+$/;

function doiOf(value: unknown): string | null {
  const text = nonEmpty(value);
  if (text === null) return null;
  const bare = text.replace(DOI_URL_PREFIX, "");
  return SAFE_DOI.test(bare) ? bare : null;
}

/** The panel's view of a source, read only from the cached CSL-JSON (FR-CIT-06). */
export function sourceDetails(item: Item): SourceDetails {
  return {
    citekey: item.id,
    title: nonEmpty(item.title) ?? item.id,
    authors: (Array.isArray(item.author) ? item.author : [])
      .map((author: unknown) => authorName(author))
      .filter((name): name is string => name !== null),
    year: year(item.issued),
    container: nonEmpty(item["container-title"]),
    doi: doiOf(item.DOI),
    library: item._zotero.library,
    key: item._zotero.key,
    status: item._zotero.status,
  };
}
