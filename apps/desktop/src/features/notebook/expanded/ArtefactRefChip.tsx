import { useId, useState } from "react";
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
 * Pending (the experiment's artefacts have not loaded yet) and detached (the
 * artefact or its pinned version is gone; FR-EDT-08's own rendering is a
 * later task) references show their last known label plainly instead. A
 * reference pinned to an older version than its artefact now has is marked,
 * with an Update control offered wherever the document can be changed
 * (FR-EDT-07).
 */
export function ArtefactRefChip({ resolved, onActivate, onUpdate }: Props) {
  const detailId = useId();
  const [showDetail, setShowDetail] = useState(false);

  if (resolved.status !== "resolved") {
    return <span className="expanded__artefact-ref">{resolved.label}</span>;
  }

  const detail =
    resolved.version === null
      ? resolved.fileName
      : `${resolved.fileName} · ${artefactVersionLabel(resolved.version)}`;
  const update = newerVersionUpdate(resolved);

  return (
    <span className="expanded__artefact-ref-group">
      <span
        className="expanded__artefact-ref expanded__artefact-ref--chip"
        role="button"
        tabIndex={0}
        aria-describedby={showDetail ? detailId : undefined}
        onMouseEnter={() => setShowDetail(true)}
        onMouseLeave={() => setShowDetail(false)}
        onFocus={() => setShowDetail(true)}
        onBlur={() => setShowDetail(false)}
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
        {showDetail && (
          <span
            role="tooltip"
            id={detailId}
            className="expanded__artefact-ref-detail"
          >
            {detail}
          </span>
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
