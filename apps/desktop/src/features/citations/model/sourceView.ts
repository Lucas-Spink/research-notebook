import type { BibliographyFileModel } from "@research-notebook/format";

type Item = BibliographyFileModel[number];

/** What the interface shows of one cached source. */
export type SourceView = {
  citekey: string;
  label: string;
  status: Item["_zotero"]["status"];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmpty(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

/** The first author's family (or literal) name, with et al. when there are more. */
function authorLabel(author: unknown): string | null {
  if (!Array.isArray(author) || author.length === 0) return null;
  const first: unknown = author[0];
  if (!isRecord(first)) return null;
  const name = nonEmpty(first.family) ?? nonEmpty(first.literal);
  if (name === null) return null;
  return author.length > 1 ? `${name} et al.` : name;
}

function yearLabel(issued: unknown): string | null {
  if (!isRecord(issued)) return null;
  const parts = issued["date-parts"];
  const first: unknown = Array.isArray(parts) ? parts[0] : undefined;
  const year: unknown = Array.isArray(first) ? first[0] : undefined;
  return typeof year === "number" || typeof year === "string"
    ? String(year)
    : null;
}

/**
 * A short label read only from the cached CSL-JSON (FR-CIT-06): author and
 * year, else the title, else the citekey. Not a formatted citation; the
 * style-driven rendering is S5-T05.
 */
export function sourceView(item: Item): SourceView {
  const author = authorLabel(item.author);
  const year = yearLabel(item.issued);
  const label =
    author !== null
      ? [author, year].filter((part) => part !== null).join(" ")
      : (nonEmpty(item.title) ?? item.id);
  return { citekey: item.id, label, status: item._zotero.status };
}

/** Looks a source up by citekey; always `null` while there is no bibliography. */
export function sourceLookup(
  file: BibliographyFileModel | null,
): (citekey: string) => SourceView | null {
  const views = new Map(
    (file ?? []).map((item) => [item.id, sourceView(item)] as const),
  );
  return (citekey) => views.get(citekey) ?? null;
}
