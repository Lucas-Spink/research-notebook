import { useEffect, useMemo, useRef, useState } from "react";
import { bibliographyRows, useSources } from "../../citations";
import { bibliographyMessages as m } from "./messages";
import "./BibliographyPanel.css";

/** A request to go to one source's entry; a new `n` repeats the request for the same source. */
export type BibliographyTarget = { citekey: string; n: number } | null;

type Props = {
  /** Every source cited anywhere in the project. */
  citekeys: ReadonlySet<string>;
  target: BibliographyTarget;
  /** Opens a source's details, with its Zotero, DOI and PDF actions. */
  onShowDetails: (citekey: string) => void;
};

/** How long the entry just jumped to stays marked. */
const MARK_MS = 2000;

/**
 * The project's Bibliography (S6-T01): a section of the page, after the whole
 * experiment table in normal flow. It does not float over the table or share
 * the window with it, so a long table pushes it further down and it is seen
 * by scrolling past the table's end. It lists every source cited in the
 * project, once, as the canonical reference list. Activating a citation in
 * the text scrolls the page down to that source's entry and marks it. It
 * reads `bibliography.json` through the sources provider, so it works with
 * Zotero closed (FR-CIT-06).
 */
export function BibliographyPanel({ citekeys, target, onShowDetails }: Props) {
  const { items } = useSources();
  const [marked, setMarked] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  const rows = useMemo(
    () => bibliographyRows(citekeys, items, m.notCached),
    [citekeys, items],
  );

  useEffect(() => {
    if (target === null) return;
    const entry = [...(list.current?.children ?? [])].find(
      (child) => child.getAttribute("data-citekey") === target.citekey,
    );
    if (!(entry instanceof HTMLElement)) return;
    // The page scrolls to it; the ribbon above is sticky, so keep it clear.
    entry.scrollIntoView?.({ block: "center" });
    entry.focus({ preventScroll: true });
    setMarked(target.citekey);
    const timer = setTimeout(() => setMarked(null), MARK_MS);
    return () => clearTimeout(timer);
  }, [target]);

  return (
    <section className="bibliography" aria-labelledby="bibliography-heading">
      <h2 id="bibliography-heading" className="bibliography__heading">
        {m.heading} <span className="bibliography__count">{rows.length}</span>
      </h2>
      {rows.length === 0 ? (
        <p className="bibliography__empty">{m.empty}</p>
      ) : (
        <ol ref={list} className="bibliography__list">
          {rows.map((row) => (
            <li
              key={row.citekey}
              data-citekey={row.citekey}
              tabIndex={-1}
              className={`bibliography__entry${marked === row.citekey ? " bibliography__entry--marked" : ""}`}
            >
              <span className="bibliography__text">{row.text}</span>
              {row.details !== null && (
                <button
                  type="button"
                  className="bibliography__details"
                  aria-label={m.detailsLabel(row.text)}
                  onClick={() => onShowDetails(row.citekey)}
                >
                  {m.details}
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
