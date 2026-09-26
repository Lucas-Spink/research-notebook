import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  artefactVersionLabel,
  expandedMessages,
  updateReferenceLabel,
} from "../messages";
import {
  newerVersionUpdate,
  type ResolvedReference,
} from "./model/artefactReference";

type Props = {
  resolved: ResolvedReference;
  /** Opens the pinned version's preview (FR-EDT-06). `undefined` for a
   * pending or detached reference, which is not yet interactive. */
  onActivate: (() => void) | undefined;
  /** Updates this one reference to its artefact's latest version
   * (FR-EDT-07). `undefined` where the document cannot be changed (a
   * static, non-live section) or there is nothing newer to update to; the
   * "newer version" mark itself still shows in that case, just without the
   * control. */
  onUpdate: (() => void) | undefined;
};

/**
 * One artefact reference (FR-EDT-06): the artefact's current display name,
 * with its filename and pinned version shown on hover or focus, and
 * activatable by click, Enter or Space to open that version's preview.
 * Pending (the experiment's artefacts have not loaded yet) shows its last
 * known label plainly, not yet interactive. Detached (the artefact or its
 * pinned version is gone, FR-EDT-08) shows the same last known label but
 * marked as detached, so it reads differently from a reference that will
 * resolve shortly. Neither is interactive: there is nothing to open. A
 * reference pinned to an older version than its artefact now has is marked,
 * with an Update control offered wherever the document can be changed
 * (FR-EDT-07).
 */
export function ArtefactRefChip({ resolved, onActivate, onUpdate }: Props) {
  const detailId = useId();
  const chip = useRef<HTMLSpanElement>(null);
  // Where the detail shows, in window coordinates, while hovered or focused.
  const [detailAt, setDetailAt] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const showDetail = () => {
    const box = chip.current?.getBoundingClientRect();
    setDetailAt({ left: box?.left ?? 0, top: box?.top ?? 0 });
  };
  const hideDetail = () => setDetailAt(null);

  if (resolved.status === "pending") {
    return <span className="expanded__artefact-ref">{resolved.label}</span>;
  }

  if (resolved.status === "detached") {
    return (
      <span className="expanded__artefact-ref-group">
        <span className="expanded__artefact-ref expanded__artefact-ref--detached">
          {resolved.label}
        </span>
        <span className="expanded__artefact-ref-newer">
          {expandedMessages.detachedBadge}
        </span>
      </span>
    );
  }

  const detail =
    resolved.version === null
      ? resolved.fileName
      : `${resolved.fileName} · ${artefactVersionLabel(resolved.version)}`;
  const update = newerVersionUpdate(resolved);

  return (
    <span className="expanded__artefact-ref-group">
      <span
        ref={chip}
        className="expanded__artefact-ref expanded__artefact-ref--chip"
        role="button"
        tabIndex={0}
        aria-describedby={detailAt === null ? undefined : detailId}
        onMouseEnter={showDetail}
        onMouseLeave={hideDetail}
        onFocus={showDetail}
        onBlur={hideDetail}
        onClick={(event) => {
          // A chip can sit inside a static section's own "make me the live
          // editor" click target; activating the chip must not also do that.
          event.stopPropagation();
          onActivate?.();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            event.stopPropagation();
            onActivate?.();
          }
        }}
      >
        {resolved.label}
        {detailAt !== null &&
          // Rendered into the document body and placed over the chip, so a
          // table cell's scrolling editor cannot clip it (ADR-0043).
          createPortal(
            <span
              role="tooltip"
              id={detailId}
              className="expanded__artefact-ref-detail"
              style={{ left: detailAt.left, top: detailAt.top }}
            >
              {detail}
            </span>,
            document.body,
          )}
      </span>
      {update !== null && (
        <span className="expanded__artefact-ref-newer">
          {expandedMessages.newerVersionBadge}
          {onUpdate !== undefined && (
            <button
              type="button"
              className="expanded__artefact-ref-update"
              aria-label={updateReferenceLabel(resolved.label, update.version)}
              onClick={(event) => {
                event.stopPropagation();
                onUpdate();
              }}
            >
              {expandedMessages.updateReference}
            </button>
          )}
        </span>
      )}
    </span>
  );
}
