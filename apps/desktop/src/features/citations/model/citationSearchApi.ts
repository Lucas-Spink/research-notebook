import type { commands } from "../../../ipc/bindings";
import { assertNever } from "../../../shared/assertNever";
import type { CitationSearchState } from "./citationSearch";

/** The command `createCitationSearch`'s `search` calls, so tests can supply a fake with the same shape. */
export type CitationSearchApi = Pick<typeof commands, "zoteroSearchItems">;

/** One Zotero search for the citation picker (FR-CIT-03), via `zotero_search_items`. */
export async function fetchCitationSearch(
  api: CitationSearchApi,
  query: string,
): Promise<CitationSearchState> {
  const result = await api.zoteroSearchItems(query);
  if (result.status === "ok") return { kind: "ok", rows: result.data };
  switch (result.error.kind) {
    case "disabled":
      return { kind: "disabled" };
    case "notRunning":
      return { kind: "notRunning" };
    case "requestFailed":
      return { kind: "error" };
    default:
      return assertNever(result.error);
  }
}
