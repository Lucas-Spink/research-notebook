import { useEffect, useRef, useState } from "react";
import { commands } from "../../ipc/bindings";
import {
  createCitationSearch,
  type CitationSearchState,
} from "./model/citationSearch";
import {
  fetchCitationSearch,
  type CitationSearchApi,
} from "./model/citationSearchApi";

/** FR-CIT-03: debounced, so every keystroke does not trigger a search. */
const DEBOUNCE_MS = 300;

/**
 * The React side of `createCitationSearch` (FR-CIT-03), mirroring
 * `useAutosave`'s split from its plain factory: one search instance lives
 * for the picker's lifetime, `query` drives it on every change, and its
 * reported state is what the picker renders.
 */
export function useCitationSearch(
  query: string,
  api: CitationSearchApi = commands,
): CitationSearchState {
  const [state, setState] = useState<CitationSearchState>({ kind: "idle" });
  const apiRef = useRef(api);
  apiRef.current = api;
  const searchRef = useRef<ReturnType<typeof createCitationSearch> | null>(
    null,
  );

  useEffect(() => {
    const search = createCitationSearch({
      delayMs: DEBOUNCE_MS,
      search: (nextQuery) => fetchCitationSearch(apiRef.current, nextQuery),
      onState: setState,
    });
    searchRef.current = search;
    return () => {
      search.dispose();
      searchRef.current = null;
    };
  }, []);

  useEffect(() => {
    searchRef.current?.setQuery(query);
  }, [query]);

  return state;
}
