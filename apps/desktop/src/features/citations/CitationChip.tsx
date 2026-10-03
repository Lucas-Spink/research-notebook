import { Fragment, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCitationJump } from "./CitationInteraction";
import { citationChipMessages as text, sourceStatusText } from "./messages";
import { bibliographyEntry } from "./model/bibliographyEntry";
import { sourceDetails } from "./model/sourceDetails";
import { useSources } from "./SourcesContext";
import "./Citations.css";

/** One citation of a source, as written: the free text around its citekey and its locator. */
export type ChipItem = {
  citekey: string;
  prefix?: string;
  suffix?: string;
};

type Props = {
  items: readonly ChipItem[];
  /** A hand-written author-in-text form, `Smith 2024 [p. 4]`, rather than `[Smith 2024, p. 4]`. */
  inText?: boolean;
};

/** The pointer may cross the gap between a reference and its preview without the preview closing. */
const HIDE_DELAY_MS = 150;
const PREVIEW_WIDTH = 360;
const MARGIN = 8;

function placement(anchor: DOMRect): { left: number; top: number } {
  const left = Math.min(
    Math.max(MARGIN, anchor.left),
    Math.max(MARGIN, window.innerWidth - PREVIEW_WIDTH - MARGIN),
  );
  const below = anchor.bottom + MARGIN;
  // Above the reference when there is little room beneath it.
  const top =
    below + 160 > window.innerHeight
      ? Math.max(MARGIN, anchor.top - 160 - MARGIN)
      : below;
  return { left, top };
}

/** The full reference and key metadata of one cited source. */
function Preview({
  citekey,
  anchor,
  onEnter,
  onLeave,
}: {
  citekey: string;
  anchor: DOMRect;
  onEnter: () => void;
  onLeave: () => void;
}) {
  const { items } = useSources();
  const item = items.find((candidate) => candidate.id === citekey);
  const details = item === undefined ? null : sourceDetails(item);
  // Rendered into the body: a table row's transform would make a fixed box relative to the row.
  return createPortal(
    <div
      role="tooltip"
      className="citation-preview"
      style={{ ...placement(anchor), width: PREVIEW_WIDTH }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {details === null ? (
        <p>{text.notCached(citekey)}</p>
      ) : (
        <>
          <p className="citation-preview__entry">
            {bibliographyEntry(details)}
          </p>
          <dl className="citation-preview__meta">
            {details.container !== null && (
              <>
                <dt>{text.publishedIn}</dt>
                <dd>{details.container}</dd>
              </>
            )}
            {details.year !== null && (
              <>
                <dt>{text.year}</dt>
                <dd>{details.year}</dd>
              </>
            )}
            {details.status !== "ok" && (
              <>
                <dt>{text.state}</dt>
                <dd>{sourceStatusText(details.status)}</dd>
              </>
            )}
          </dl>
        </>
      )}
      <p className="citation-preview__hint">{text.clickHint}</p>
    </div>,
    document.body,
  );
}

/** One source's short label as a button: hover or focus shows its full reference, activating it jumps to the Bibliography. */
export function CitationSource({
  citekey,
  onActivate,
}: {
  citekey: string;
  /** Also done when it is activated, before the jump. */
  onActivate?: () => void;
}) {
  const { lookup } = useSources();
  const jump = useCitationJump();
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const node = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const view = lookup(citekey);
  const label = view === null ? `@${citekey}` : view.label;

  const cancelHide = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const show = () => {
    cancelHide();
    const rect = node.current?.getBoundingClientRect();
    if (rect !== undefined) setAnchor(rect);
  };
  const hideSoon = () => {
    cancelHide();
    timer.current = setTimeout(() => setAnchor(null), HIDE_DELAY_MS);
  };
  useEffect(() => cancelHide, []);

  return (
    <>
      <button
        ref={node}
        type="button"
        className="citation-chip__source"
        data-citekey={citekey}
        aria-label={text.goTo(label)}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
        onKeyDown={(event) => {
          if (event.key === "Escape") setAnchor(null);
        }}
        onClick={(event) => {
          // Not the cell's own click, which would open it for editing.
          event.stopPropagation();
          setAnchor(null);
          onActivate?.();
          jump(citekey);
        }}
        // A citation inside the live editor is an atom; the click is for the chip.
        onMouseDown={(event) => event.stopPropagation()}
      >
        {label}
      </button>
      {anchor !== null && (
        <Preview
          citekey={citekey}
          anchor={anchor}
          onEnter={cancelHide}
          onLeave={hideSoon}
        />
      )}
    </>
  );
}

/**
 * A citation as an interactive reference, `[Smith 2024]` (S6-T01): hovering
 * or focusing a source shows its full reference and key metadata, and
 * activating it jumps to that source in the Bibliography below the table.
 * Used wherever a citation is shown: in a cell, in the live editor and in a
 * section's read-only view.
 */
export function CitationChip({ items, inText = false }: Props) {
  const sources = items.map((item, index) => (
    <Fragment key={`${item.citekey}-${index}`}>
      {index > 0 && "; "}
      {inText ? null : item.prefix}
      <CitationSource citekey={item.citekey} />
      {item.suffix ? (inText ? ` [${item.suffix}]` : `, ${item.suffix}`) : null}
    </Fragment>
  ));
  return (
    <span className="citation-chip" contentEditable={false}>
      {inText ? sources : <>[{sources}]</>}
    </span>
  );
}
