import type { ZoteroSearchRow } from "../../../ipc/bindings";

/**
 * The citation picker's search state (FR-CIT-03): `notRunning` and
 * `disabled` mirror the status indicator's offline states (FR-CIT-01)
 * rather than being folded into a generic `error`, so the picker can
 * explain why search is unavailable.
 */
export type CitationSearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ok"; rows: ZoteroSearchRow[] }
  | { kind: "notRunning" }
  | { kind: "disabled" }
  | { kind: "error" };

export type CitationSearch = {
  /** Call on every change to the query text; empty text reports `idle`. */
  setQuery(query: string): void;
  /** Stops the debounce timer; a search already in flight is ignored. */
  dispose(): void;
};

type Options = {
  /** How long a change waits, with no other, before searching. */
  delayMs: number;
  /** Runs one search. Resolving or rejecting after `dispose` is harmless. */
  search: (query: string) => Promise<CitationSearchState>;
  /** Called whenever the state changes, for the picker to show. */
  onState: (state: CitationSearchState) => void;
};

/**
 * Debounces the citation picker's search (FR-CIT-03): `delayMs` after the
 * last change to the query, `search` runs once. A result belonging to a
 * query that is no longer current — the person kept typing before it
 * resolved — is silently dropped, so a slow early search can never
 * overwrite a later, faster one.
 */
export function createCitationSearch(options: Options): CitationSearch {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  let requestId = 0;

  function stopTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function report(state: CitationSearchState) {
    if (!disposed) options.onState(state);
  }

  return {
    setQuery(query) {
      if (disposed) return;
      stopTimer();
      const trimmed = query.trim();
      if (trimmed === "") {
        requestId += 1;
        report({ kind: "idle" });
        return;
      }
      report({ kind: "loading" });
      const id = ++requestId;
      timer = setTimeout(() => {
        void options
          .search(trimmed)
          .then((state) => {
            if (!disposed && id === requestId) report(state);
          })
          .catch(() => {
            if (!disposed && id === requestId) report({ kind: "error" });
          });
      }, options.delayMs);
    },
    dispose() {
      stopTimer();
      disposed = true;
    },
  };
}
