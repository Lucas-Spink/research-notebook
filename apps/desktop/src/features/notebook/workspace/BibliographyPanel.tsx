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
 * The project's Bibliography (S6-T01), always below the table: every source
 * cited in the project, once, as the canonical reference list. Activating a
 * citation in the text comes here, opens the list if it was collapsed,
 * scrolls the entry into view and marks it. It reads `bibliography.json`
 * through the sources provider, so it works with Zotero closed (FR-CIT-06).
 */
export function BibliographyPanel({ citekeys, target, onShowDetails }: Props) {
  const { items } = useSources();
  const [open, setOpen] = useState(true);
  const [marked, setMarked] = useState<string | null>(null);
  const list = useRef<HTMLOListElement>(null);
  // The jump already carried out, so reopening the list does not repeat it.
  const handled = useRef(0);
  const rows = useMemo(
    () => bibliographyRows(citekeys, items, m.notCached),
    [citekeys, items],
  );

  // Reopens a collapsed list for a jump; the entry exists only once it is open.
  useEffect(() => {
    if (target !== null) setOpen(true);
  }, [target]);

  useEffect(() => {
    if (target === null || !open || handled.current === target.n) return;
    const entry = [...(list.current?.children ?? [])].find(
      (child) => child.getAttribute("data-citekey") === target.citekey,
    );
    if (!(entry instanceof HTMLElement)) return;
    entry.scrollIntoView?.({ block: "nearest" });
    entry.focus({ preventScroll: true });
    handled.current = target.n;
    setMarked(target.citekey);
    const timer = setTimeout(() => setMarked(null), MARK_MS);
    return () => clearTimeout(timer);
  }, [target, open]);

  return (
    <section
      className={`bibliography${open ? "" : " bibliography--closed"}`}
      aria-labelledby="bibliography-heading"
    >
      <h2 id="bibliography-heading" className="bibliography__heading">
        <button
          type="button"
          aria-expanded={open}
          className="bibliography__toggle"
          onClick={() => setOpen(!open)}
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span> {m.heading}{" "}
          <span className="bibliography__count">{rows.length}</span>
        </button>
      </h2>
      {open &&
        (rows.length === 0 ? (
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
        ))}
    </section>
  );
}
