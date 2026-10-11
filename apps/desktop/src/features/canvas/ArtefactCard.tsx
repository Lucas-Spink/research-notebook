import { NodeResizer, useStore, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { useCard } from "./CardContext";
import { canvasMessages as m } from "./messages";
import type { ArtefactFlowNode } from "./model/flowNodes";
import { MIN_CARD } from "./model/nodes";
import type { PictureDetail } from "./model/results";

/** A picture wider than this on screen, in device pixels, is drawn from the file; a 256 px thumbnail would be blurred. */
const FULL_ABOVE = 240;

/**
 * A pinned result on the canvas (ADR-0064): its name, which experiment it
 * belongs to, the version shown, and its picture. It points at the result and
 * holds none of it, so removing the card removes only the card. A card never
 * moves to a newer version by itself; when there is one it says so and the
 * person chooses.
 */
function ArtefactCardView({
  data,
  selected,
  width,
}: NodeProps<ArtefactFlowNode>) {
  const { services, editable, onRemove, onUpdateVersion } = useCard();
  const { node, info } = data;
  // Only the answer is subscribed to, so a card re-renders when it crosses the line, not on every step of a zoom.
  const wide = useStore(
    (state) =>
      (width ?? node.size.width) *
        state.transform[2] *
        (window.devicePixelRatio || 1) >
      FULL_ABOVE,
  );
  const detail: PictureDetail = wide ? "full" : "thumbnail";

  if (info.status === "missing") {
    return (
      <div
        className="canvas-card canvas-card--missing"
        role="group"
        aria-label={m.missingCard}
      >
        <header className="canvas-card__head">
          <strong>{m.missingCard}</strong>
          {editable && (
            <button
              type="button"
              className="nodrag nopan"
              aria-label={m.removeCard}
              title={m.removeCard}
              onClick={() => onRemove(node.id)}
            >
              ×
            </button>
          )}
        </header>
        <p className="canvas-card__reason">{m.missingReasons[info.reason]}</p>
        <p className="canvas-card__reason">{m.missingKept}</p>
      </div>
    );
  }

  const newer =
    info.latestVersion !== null &&
    info.shownVersion !== null &&
    info.latestVersion > info.shownVersion;
  return (
    <>
      {/* Outside the card, whose edges clip what is drawn past them: the handles sit on its border. */}
      <NodeResizer
        isVisible={selected && editable}
        minWidth={MIN_CARD.width}
        minHeight={MIN_CARD.height}
        handleClassName="canvas-resize-handle"
        lineClassName="canvas-resize-line"
      />
      <div
        className="canvas-card"
        role="group"
        aria-label={m.cardLabel(info.name, info.experimentRef)}
      >
        <header className="canvas-card__head">
          <strong title={info.name}>{info.name}</strong>
          <button
            type="button"
            className="nodrag nopan"
            aria-label={m.openOriginal(info.name)}
            title={m.openOriginal(info.name)}
            onClick={() => services.onOpen(info, node)}
          >
            ↗
          </button>
          {editable && (
            <button
              type="button"
              className="nodrag nopan"
              aria-label={m.removeCard}
              title={m.removeCard}
              onClick={() => onRemove(node.id)}
            >
              ×
            </button>
          )}
        </header>
        <p className="canvas-card__meta">
          <span title={info.experimentTitle}>{info.experimentRef}</span>
          {info.shownVersion !== null && <span> · v{info.shownVersion}</span>}
          {newer && info.latestVersion !== null && (
            <span className="canvas-card__newer">
              {" "}
              · {m.newerVersion(info.latestVersion)}
              {editable && (
                <button
                  type="button"
                  className="nodrag nopan"
                  onClick={() =>
                    onUpdateVersion(node.id, info.latestVersion ?? 0)
                  }
                >
                  {m.updateTo(info.latestVersion)}
                </button>
              )}
            </span>
          )}
        </p>
        <div className="canvas-card__body">
          {services.renderPreview(info, detail)}
        </div>
      </div>
    </>
  );
}

export const ArtefactCard = memo(ArtefactCardView);
