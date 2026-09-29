/**
 * The citation picker's selection state (FR-CIT-03): the sources chosen so
 * far, each with its own locator, prefix and suffix. `buildCitationMarkdown`
 * composes the final Pandoc bracket text (spec 5.7) once the person
 * confirms. This is plain, framework-agnostic model code — the picker
 * component only calls these functions.
 */

/** Spec 5.7: "the picker offers page, chapter, figure, section, table and supplement." */
export type LocatorTerm =
  "page" | "chapter" | "figure" | "section" | "table" | "supplement";

export const LOCATOR_TERMS: readonly LocatorTerm[] = [
  "page",
  "chapter",
  "figure",
  "section",
  "table",
  "supplement",
];

/** One selected source and its per-item citation details (FR-CIT-03). */
export type CitationSelectionItem = {
  citekey: string;
  /** For display only; not written to the citation text itself. */
  title: string;
  locatorTerm: LocatorTerm | null;
  locatorValue: string;
  prefix: string;
  suffix: string;
};

/** A freshly selected source, with no locator, prefix or suffix yet. */
export function newSelectionItem(
  citekey: string,
  title: string,
): CitationSelectionItem {
  return {
    citekey,
    title,
    locatorTerm: null,
    locatorValue: "",
    prefix: "",
    suffix: "",
  };
}

/** Adds `item` if `citekey` is not yet selected, otherwise removes it. */
export function toggleSelection(
  selected: readonly CitationSelectionItem[],
  item: CitationSelectionItem,
): CitationSelectionItem[] {
  return selected.some((existing) => existing.citekey === item.citekey)
    ? selected.filter((existing) => existing.citekey !== item.citekey)
    : [...selected, item];
}

/** Updates one selected item's locator, prefix or suffix by citekey. */
export function updateSelection(
  selected: readonly CitationSelectionItem[],
  citekey: string,
  changes: Partial<
    Pick<
      CitationSelectionItem,
      "locatorTerm" | "locatorValue" | "prefix" | "suffix"
    >
  >,
): CitationSelectionItem[] {
  return selected.map((item) =>
    item.citekey === citekey ? { ...item, ...changes } : item,
  );
}

/** The locator's literal text, e.g. "page 6"; empty when no value is set. */
function locatorText(item: CitationSelectionItem): string {
  if (item.locatorTerm === null) return "";
  const value = item.locatorValue.trim();
  return value === "" ? "" : `${item.locatorTerm} ${value}`;
}

/** One citation item's text after the leading `[`/trailing `]` are added. */
function itemMarkdown(item: CitationSelectionItem): string {
  const prefix = item.prefix.trim();
  const suffix = item.suffix.trim();
  const afterComma = [locatorText(item), suffix]
    .filter((part) => part !== "")
    .join(", ");
  const prefixPart = prefix === "" ? "" : `${prefix} `;
  const detailPart = afterComma === "" ? "" : `, ${afterComma}`;
  return `${prefixPart}@${item.citekey}${detailPart}`;
}

/**
 * Spec 5.7's bracketed Pandoc citation syntax for every selected item, in
 * selection order, semicolon-separated. Empty for no selection (the picker
 * never confirms with nothing selected, but this stays total for testing).
 */
export function buildCitationMarkdown(
  items: readonly CitationSelectionItem[],
): string {
  if (items.length === 0) return "";
  return `[${items.map(itemMarkdown).join("; ")}]`;
}
