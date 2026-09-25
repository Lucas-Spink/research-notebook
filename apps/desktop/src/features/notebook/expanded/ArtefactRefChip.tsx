import { useId, useState } from "react";
import { artefactVersionLabel } from "../messages";
import type { ResolvedReference } from "./model/artefactReference";

type Props = {
  resolved: ResolvedReference;
  /** Opens the pinned version's preview (FR-EDT-06). `undefined` for a
   * pending or detached reference, which is not yet interactive. */
  onActivate: (() => void) | undefined;
};

/**
 * One artefact reference (FR-EDT-06): the artefact's current display name,
 * with its filename and pinned version shown on hover or focus, and
 * activatable by click, Enter or Space to open that version's preview.
 * Pending (the experiment's artefacts have not loaded yet) and detached (the
 * artefact or its pinned version is gone; FR-EDT-08's own rendering is a
 * later task) references show their last known label plainly instead.
 */
export function ArtefactRefChip({ resolved, onActivate }: Props) {
  const detailId = useId();
  const [showDetail, setShowDetail] = useState(false);

  if (resolved.status !== "resolved") {
    return <span className="expanded__artefact-ref">{resolved.label}</span>;
  }

  const detail =
    resolved.version === null
      ? resolved.fileName
      : `${resolved.fileName} · ${artefactVersionLabel(resolved.version)}`;

  return (
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
  );
}
