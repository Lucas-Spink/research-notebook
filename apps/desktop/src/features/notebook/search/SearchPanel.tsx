import type { Arranged, RecognisedSectionKey } from "@research-notebook/format";
import { useId, useMemo, useState } from "react";
import { commands } from "../../../ipc/bindings";
import type { FolderHandle } from "../../../ipc/bindings";
import {
  searchHitFieldLabel,
  searchHitText,
  searchMessages,
} from "../messages";
import { buildSearchIndex, searchNotebook } from "./model/searchIndex";
import { useAllArtefacts } from "./model/useAllArtefacts";
import "./SearchPanel.css";

type Props = {
  arranged: Arranged;
  folder: FolderHandle;
  /** Opens a result at its question or experiment, and its section when it has one (FR-SRC-02). */
  onOpenResult: (key: string, section: RecognisedSectionKey | null) => void;
};

function experimentFoldersOf(arranged: Arranged): string[] {
  return [
    ...arranged.questions.flatMap((group) =>
      group.experiments.map((item) => item.experiment.folder),
    ),
    ...arranged.unassigned.map((item) => item.experiment.folder),
  ];
}

/**
 * Search across the project already loaded (FR-SRC-01): question and
 * experiment titles, Methods, Results Notes and Interpretation, and every
 * artefact's display name and filename. Results are grouped by question or
 * experiment (FR-SRC-02); activating one opens it at that location.
 */
export function SearchPanel({ arranged, folder, onOpenResult }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const headingId = useId();
  const inputId = useId();

  const experimentFolders = useMemo(
    () => experimentFoldersOf(arranged),
    [arranged],
  );
  const artefactsByFolder = useAllArtefacts(
    commands,
    folder,
    experimentFolders,
    open,
  );
  const index = useMemo(
    () => buildSearchIndex(arranged, artefactsByFolder),
    [arranged, artefactsByFolder],
  );
  const results = useMemo(() => searchNotebook(index, query), [index, query]);

  return (
    <div className="notebook__search">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        {searchMessages.toggle}
      </button>
      {open && (
        <section
          className="notebook__search-panel"
          aria-labelledby={headingId}
          role="search"
        >
          <h4 id={headingId}>{searchMessages.heading}</h4>
          <label htmlFor={inputId}>{searchMessages.queryLabel}</label>
          <input
            id={inputId}
            type="search"
            value={query}
            placeholder={searchMessages.queryPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query.trim() !== "" && results.length === 0 && (
            <p>{searchMessages.empty}</p>
          )}
          <ul className="notebook__search-results">
            {results.map((group) => (
              <li key={group.key}>
                <p className="notebook__search-group">
                  {group.ref} {group.title}
                </p>
                <ul>
                  {group.hits.map((hit, hitIndex) => (
                    <li key={hitIndex}>
                      <button
                        type="button"
                        className="notebook__search-hit"
                        onClick={() =>
                          onOpenResult(
                            group.key,
                            hit.kind === "section" ? hit.section : null,
                          )
                        }
                      >
                        <span className="notebook__search-hit-field">
                          {searchHitFieldLabel(hit)}
                        </span>
                        <span>{searchHitText(hit)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
