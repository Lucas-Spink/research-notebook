import { orderByShape, type Shape } from "../key-order";
import type { FormatError, Result } from "../result";
import { BibliographyFile, type BibliographyFileModel } from "../schema";
import { parseJsonFile } from "./read";

const ZOTERO_SHAPE: Shape = {
  keys: ["server_id", "library", "key", "fetched", "status"],
};

/** Parses `bibliography.json` (spec 5.9). Unknown CSL fields are accepted and kept. */
export function parseBibliography(
  text: string,
): Result<BibliographyFileModel, FormatError> {
  return parseJsonFile(text, BibliographyFile);
}

/**
 * Format-v1.md 3.5: `id` first, the other CSL-JSON fields in their original
 * order, `_zotero` last so the bibliographic data reads ahead of the cache
 * metadata. The general shape rule (known keys first) cannot express "known
 * key last", so each item is ordered here.
 */
function orderItem(item: BibliographyFileModel[number]): unknown {
  const { id, _zotero, ...rest } = item;
  return Object.fromEntries([
    ["id", id],
    ...Object.entries(rest),
    ["_zotero", orderByShape(_zotero, ZOTERO_SHAPE)],
  ]);
}

/** Writes `bibliography.json` in canonical form (format-v1.md 3.5). */
export function serialiseBibliography(items: BibliographyFileModel): string {
  return `${JSON.stringify(items.map(orderItem), null, 2)}\n`;
}
