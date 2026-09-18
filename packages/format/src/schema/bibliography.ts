import { z } from "zod";
import {
  Citekey,
  SingleLine,
  Timestamp,
  ZoteroItemKey,
  ZoteroLibrary,
} from "./common";

/** Spec 5.9 `_zotero.status`. */
export const SOURCE_STATUSES = ["ok", "trashed", "missing"] as const;

const ZoteroMetadata = z.looseObject({
  // Null when Zotero did not send a Zotero-Server-ID header (FR-CIT-02).
  server_id: SingleLine.nullable(),
  library: ZoteroLibrary,
  key: ZoteroItemKey,
  fetched: Timestamp,
  status: z.enum(SOURCE_STATUSES),
});

/**
 * Spec 5.9: one CSL-JSON item. Only the fields the application relies on are
 * validated; every other CSL field passes through unchanged.
 */
export const BibliographyItem = z
  .looseObject({
    id: Citekey,
    _zotero: ZoteroMetadata,
  })
  .superRefine((item, ctx) => {
    if (item.id !== `z:${item._zotero.library}:${item._zotero.key}`) {
      ctx.addIssue({
        code: "custom",
        path: ["id"],
        message: "id must equal z:<library>:<key> from _zotero",
      });
    }
  });

/** Spec 5.9: `_notebook/bibliography.json`, an array of CSL-JSON items. */
export const BibliographyFile = z
  .array(BibliographyItem)
  .superRefine((items, ctx) => {
    const seen = new Set<string>();
    items.forEach((item, index) => {
      if (seen.has(item.id)) {
        ctx.addIssue({
          code: "custom",
          path: [index, "id"],
          message: "citekey appears more than once",
        });
      }
      seen.add(item.id);
    });
  });

export type BibliographyItemModel = z.infer<typeof BibliographyItem>;
export type BibliographyFileModel = z.infer<typeof BibliographyFile>;
