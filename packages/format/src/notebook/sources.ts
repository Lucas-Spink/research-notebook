import { fail, ok, type Result } from "../result";
import type { BibliographyFileModel } from "../schema";
import { formatTimestamp } from "./util";

type Item = BibliographyFileModel[number];

/** What Zotero told us about one source, ready to be merged into `bibliography.json`. */
export interface FetchedSource {
  library: string;
  key: string;
  /** The `Zotero-Server-ID` header, or `null` when Zotero sent none (FR-CIT-02). */
  serverId: string | null;
  trashed: boolean;
  /** CSL-JSON as Zotero sent it. Its `id` and any `_zotero` are ignored. */
  csl: Readonly<Record<string, unknown>>;
}

export type SourceChange = "added" | "updated" | "unchanged";

/** Why a refresh stopped to ask (FR-CIT-07): the stored data came from another Zotero. */
export interface ServerMismatch {
  kind: "server-mismatch";
  citekey: string;
  storedServerId: string;
  fetchedServerId: string;
}

/** Spec 5.7: `z:<library>:<item-key>`. */
export function citekeyOf(library: string, key: string): string {
  return `z:${library}:${key}`;
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The CSL fields without the two keys the application owns. */
function cslFields(
  item: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(item).filter(([k]) => k !== "id" && k !== "_zotero"),
  );
}

/**
 * A server id that disagrees with the stored one. Missing on either side is
 * not a disagreement: a header that was not sent cannot show a different
 * library, and a stored `null` has nothing to protect.
 */
function mismatch(stored: Item, fetched: FetchedSource): ServerMismatch | null {
  const storedId = stored._zotero.server_id;
  if (storedId === null || fetched.serverId === null) return null;
  if (storedId === fetched.serverId) return null;
  return {
    kind: "server-mismatch",
    citekey: stored.id,
    storedServerId: storedId,
    fetchedServerId: fetched.serverId,
  };
}

function build(
  fetched: FetchedSource,
  serverId: string | null,
  now: Date,
): Item {
  const citekey = citekeyOf(fetched.library, fetched.key);
  return {
    id: citekey,
    ...cslFields(fetched.csl),
    _zotero: {
      server_id: serverId,
      library: fetched.library,
      key: fetched.key,
      fetched: formatTimestamp(now),
      status: fetched.trashed ? "trashed" : "ok",
    },
  };
}

function replaceAt(
  file: BibliographyFileModel,
  index: number,
  item: Item,
): BibliographyFileModel {
  return file.map((existing, at) => (at === index ? item : existing));
}

/**
 * Adds or refreshes one source (FR-CIT-05, FR-CIT-07). New sources are
 * appended; held ones are updated in place. When nothing but the fetch time
 * would change the file is returned as it was, so a refresh leaves quiet
 * Git diffs. A different server id is refused with `server-mismatch` until the
 * caller passes `confirmServerChange` (FR-CIT-07); nothing is written then.
 * Never removes a source (spec 5.9) and never changes the input.
 */
export function upsertSource(
  file: BibliographyFileModel,
  fetched: FetchedSource,
  now: () => Date,
  options: { confirmServerChange?: boolean } = {},
): Result<
  { file: BibliographyFileModel; change: SourceChange },
  ServerMismatch
> {
  const citekey = citekeyOf(fetched.library, fetched.key);
  const index = file.findIndex((item) => item.id === citekey);
  const held = file[index];
  if (held === undefined) {
    const item = build(fetched, fetched.serverId, now());
    return ok({ file: [...file, item], change: "added" });
  }
  if (options.confirmServerChange !== true) {
    const refused = mismatch(held, fetched);
    if (refused !== null) return fail(refused);
  }
  const next = build(
    fetched,
    fetched.serverId ?? held._zotero.server_id,
    now(),
  );
  const unchanged =
    sameJson(cslFields(held), cslFields(next)) &&
    held._zotero.status === next._zotero.status &&
    held._zotero.server_id === next._zotero.server_id;
  if (unchanged) return ok({ file, change: "unchanged" });
  return ok({ file: replaceAt(file, index, next), change: "updated" });
}

/**
 * Records that Zotero no longer has the item (FR-CIT-07). The cached
 * metadata stays so the citation still renders; only the status changes.
 * A citekey that is not held is ignored rather than invented.
 */
export function markSourceMissing(
  file: BibliographyFileModel,
  citekey: string,
): { file: BibliographyFileModel; change: SourceChange } {
  const index = file.findIndex((item) => item.id === citekey);
  const held = file[index];
  if (held === undefined || held._zotero.status === "missing") {
    return { file, change: "unchanged" };
  }
  const next: Item = {
    ...held,
    _zotero: { ...held._zotero, status: "missing" },
  };
  return { file: replaceAt(file, index, next), change: "updated" };
}
