import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  bibliographyRows,
  compactEntry,
  useSources,
  type BibliographyRow,
} from "../../citations";
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
  // View state only: it is not project data, so it is not saved.
  const [open, setOpen] = useState(true);
  const listId = useId();
  const list = useRef<HTMLOListElement>(null);
  const rows = useMemo(
    () => bibliographyRows(citekeys, items, m.notCached),
    [citekeys, items],
  );

  useEffect(() => {
    if (target === null) return;
    // A citation jumped to must be visible, so a collapsed list opens first.
    if (!open) {
      setOpen(true);
      return;
    }
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
  }, [target, open]);

  return (
    <section className="bibliography" aria-labelledby="bibliography-heading">
      <h2 id="bibliography-heading" className="bibliography__heading">
        <button
          type="button"
          className="bibliography__toggle"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen(!open)}
        >
          <span aria-hidden="true">{open ? "▾" : "▸"}</span> {m.heading}{" "}
          <span className="bibliography__count">{rows.length}</span>
        </button>
      </h2>
      {!open ? null : rows.length === 0 ? (
        <p className="bibliography__empty">{m.empty}</p>
      ) : (
        <ol ref={list} id={listId} className="bibliography__list">
          {rows.map((row) => (
            <li
              key={row.citekey}
              data-citekey={row.citekey}
              tabIndex={-1}
              className={`bibliography__entry${marked === row.citekey ? " bibliography__entry--marked" : ""}`}
            >
              {row.details === null ? (
                <span className="bibliography__text">{row.text}</span>
              ) : (
                <CompactEntry text={row.text} details={row.details} />
              )}
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

/**
 * One source, collapsed to its title and a line of abbreviated authors, year
 * and journal; opening it shows the full reference (issue #101). A native
 * disclosure keeps it keyboard-operable without a second state in the panel.
 */
function CompactEntry({
  text,
  details,
}: {
  text: string;
  details: NonNullable<BibliographyRow["details"]>;
}) {
  const { title, meta } = compactEntry(details);
  return (
    <details className="bibliography__compact">
      <summary className="bibliography__summary">
        <span className="bibliography__title">{title}</span>
        {meta !== "" && <span className="bibliography__meta">{meta}</span>}
      </summary>
      <p className="bibliography__text">{text}</p>
    </details>
  );
}
