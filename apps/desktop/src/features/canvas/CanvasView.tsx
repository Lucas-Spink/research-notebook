import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { CanvasPicker } from "./CanvasPicker";
import { CanvasSurface } from "./CanvasSurface";
import { canvasMessages as m } from "./messages";
import { applyEdits } from "./model/flowChanges";
import { setViewport, updatePinnedVersion } from "./model/nodes";
import type { CardServices } from "./model/results";
import {
  LEFT_LIMITS,
  RIGHT_LIMITS,
  initialLayout,
  layoutReducer,
  visibleWidths,
} from "./model/layout";
import { Splitter } from "./Splitter";
import type { CanvasesModel } from "./useCanvases";
import "./Canvas.css";

/** Used until the window is measured, and where it cannot be (tests). */
const UNMEASURED_WIDTH = 1280;

type Props = {
  canvases: CanvasesModel;
  /** What a result card needs from the rest of the application: finding, drawing and opening the result. */
  cards: CardServices;
  /** The results of every experiment, to drag onto the canvas. Its own feature fills this in. */
  resultsPanel?: ReactNode;
  /** The Methods, Results Notes and Interpretation of the active experiment. */
  writingPanel?: ReactNode;
};

/** The width of the element, kept up to date as the window is resized. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(UNMEASURED_WIDTH);
  useEffect(() => {
    const node = ref.current;
    if (node === null || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth > 0) setWidth(node.clientWidth);
    });
    observer.observe(node);
    if (node.clientWidth > 0) setWidth(node.clientWidth);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/**
 * The canvas view (ADR-0064): a results browser on the left, the canvas in
 * the middle and the writing panels on the right, with a picker for the
 * project's canvases above them. The side panels resize and collapse; the
 * canvas keeps a minimum width. It shows the same notebook as the table, so
 * nothing here owns experiment text.
 */
export function CanvasView({
  canvases,
  cards,
  resultsPanel,
  writingPanel,
}: Props) {
  const [layout, dispatch] = useReducer(layoutReducer, initialLayout);
  const [ref, total] = useWidth();
  const widths = visibleWidths(layout, total);
  const { status, selected, notice } = canvases;

  return (
    <section className="canvas-view" aria-label={m.canvas}>
      <div className="canvas-view__bar">
        <CanvasPicker model={canvases} />
        <div className="canvas-view__toggles">
          <button
            type="button"
            aria-pressed={!layout.leftCollapsed}
            onClick={() => dispatch({ type: "toggle", side: "left" })}
          >
            {layout.leftCollapsed ? m.showResults : m.hideResults}
          </button>
          <button
            type="button"
            aria-pressed={!layout.rightCollapsed}
            onClick={() => dispatch({ type: "toggle", side: "right" })}
          >
            {layout.rightCollapsed ? m.showWriting : m.hideWriting}
          </button>
        </div>
      </div>
      <div role="status" aria-live="polite" className="canvas-view__notices">
        {status === "loading" && <p>{m.loading}</p>}
        {!canvases.writable && <p>{m.readOnlyProject}</p>}
        {selected !== null && selected.file === null && (
          <p>{m.unreadableNotice}</p>
        )}
        {notice !== null && (
          <p className="notice">
            <span>{notice}</span>
            <button
              type="button"
              className="notice__dismiss"
              aria-label="Dismiss"
              onClick={canvases.dismissNotice}
            >
              ×
            </button>
          </p>
        )}
      </div>
      <div className="canvas-view__body" ref={ref}>
        {widths.left > 0 && (
          <>
            <aside
              className="canvas-view__panel"
              style={{ width: widths.left }}
              aria-labelledby="canvas-results-heading"
            >
              <h3 id="canvas-results-heading">{m.resultsHeading}</h3>
              {resultsPanel ?? (
                <p className="canvas-view__placeholder">
                  {m.resultsPlaceholder}
                </p>
              )}
            </aside>
            <Splitter
              label={m.resizeResults}
              value={layout.left}
              min={LEFT_LIMITS.min}
              max={LEFT_LIMITS.max}
              direction={1}
              onResize={(width) =>
                dispatch({ type: "resize", side: "left", width })
              }
              onNudge={(delta) =>
                dispatch({ type: "nudge", side: "left", delta })
              }
            />
          </>
        )}
        <div className="canvas-view__centre">
          {selected?.file != null ? (
            <CanvasSurface
              key={selected.fileName}
              canvas={selected.file}
              services={cards}
              editable={canvases.writable}
              onEdits={(edits) =>
                canvases.edit((file) => applyEdits(file, edits))
              }
              onViewport={(view) =>
                canvases.edit((file) => setViewport(file, view))
              }
              onUpdateVersion={(id, version) =>
                canvases.edit((file) => updatePinnedVersion(file, id, version))
              }
              registerSurface={canvases.registerSurface}
            />
          ) : (
            status === "ready" && (
              <div className="canvas-view__empty">
                <p>{selected === null ? m.noCanvases : m.unreadableNotice}</p>
                {selected === null && <p>{m.noCanvasesHint}</p>}
              </div>
            )
          )}
        </div>
        {widths.right > 0 && (
          <>
            <Splitter
              label={m.resizeWriting}
              value={layout.right}
              min={RIGHT_LIMITS.min}
              max={RIGHT_LIMITS.max}
              direction={-1}
              onResize={(width) =>
                dispatch({ type: "resize", side: "right", width })
              }
              onNudge={(delta) =>
                dispatch({ type: "nudge", side: "right", delta })
              }
            />
            <aside
              className="canvas-view__panel"
              style={{ width: widths.right }}
              aria-labelledby="canvas-writing-heading"
            >
              <h3 id="canvas-writing-heading">{m.writingHeading}</h3>
              {writingPanel ?? (
                <p className="canvas-view__placeholder">
                  {m.writingPlaceholder}
                </p>
              )}
            </aside>
          </>
        )}
      </div>
    </section>
  );
}
