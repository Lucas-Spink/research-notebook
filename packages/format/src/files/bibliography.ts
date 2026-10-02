import { z } from "zod";
import { orderByShape, type Shape } from "../key-order";
import { fail, ok, type FormatError, type Result } from "../result";
import { BibliographyFile, type BibliographyFileModel } from "../schema";
import { zodFailure } from "../zod-error";
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

const CslJsonItem = z.record(z.string(), z.unknown());

/**
 * Validates one item of CSL-JSON as Zotero sent it, before it is merged into
 * `bibliography.json`. Only the outer shape is checked: CSL fields are kept
 * as they are (format-v1.md 4.5).
 */
export function parseCslJsonItem(
  text: string,
): Result<Record<string, unknown>, FormatError> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return fail({
      kind: "syntax",
      message: error instanceof Error ? error.message : "invalid JSON",
    });
  }
  const checked = CslJsonItem.safeParse(value);
  return checked.success ? ok(checked.data) : fail(zodFailure(checked.error));
}
