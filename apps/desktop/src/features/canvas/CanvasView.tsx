import { useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { CanvasSurface } from "./CanvasSurface";
import { canvasMessages as m } from "./messages";
import { applyEdits } from "./model/flowChanges";
import {
  LEFT_LIMITS,
  RIGHT_LIMITS,
  initialLayout,
  layoutReducer,
  visibleWidths,
} from "./model/layout";
import { setViewport, updatePinnedVersion } from "./model/nodes";
import type { CardServices } from "./model/results";
import { NotesSummary } from "./NotesSummary";
import { QuestionTabs, type QuestionChoice } from "./QuestionTabs";
import { Splitter } from "./Splitter";
import type { CanvasesModel } from "./useCanvases";
import "./Canvas.css";

/** Used until the window is measured, and where it cannot be (tests). */
const UNMEASURED_WIDTH = 1280;

type Props = {
  canvases: CanvasesModel;
  /** What a result card needs from the rest of the application: finding, drawing and opening the result. */
  cards: CardServices;
  /** The questions, one tab each, and the one whose canvas is showing. */
  questions: readonly QuestionChoice[];
  question: string | null;
  onChooseQuestion: (key: string) => void;
  /** The results of every experiment, to drag onto the canvas. Its own feature fills this in. */
  resultsPanel?: ReactNode;
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
 * The canvas view (ADR-0065): a row of tabs, one for each question, then a
 * results browser on the left, the question's canvas in the middle and the
 * summary of its notes on the right. The canvas is for drafting: notes, figures
 * and the lines between them. It shows the same notebook as the table, and
 * owns no experiment text. The side panels resize and collapse; the canvas
 * keeps a minimum width.
 */
export function CanvasView({
  canvases,
  cards,
  questions,
  question,
  onChooseQuestion,
  resultsPanel,
}: Props) {
  const [layout, dispatch] = useReducer(layoutReducer, initialLayout);
  const [ref, total] = useWidth();
  const widths = visibleWidths(layout, total);
  const { status, current, notice, writable } = canvases;
  const file = current?.file ?? null;

  return (
    <section className="canvas-view" aria-label={m.canvas}>
      <div className="canvas-view__bar">
        <QuestionTabs
          questions={questions}
          current={question}
          onChoose={onChooseQuestion}
        />
        <div className="canvas-view__toggles">
          <button
            type="button"
            disabled={!writable || file === null}
            onClick={() => canvases.addNote()}
          >
            {m.addNote}
          </button>
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
            {layout.rightCollapsed ? m.showNotes : m.hideNotes}
          </button>
        </div>
      </div>
      <div role="status" aria-live="polite" className="canvas-view__notices">
        {status === "loading" && <p>{m.loading}</p>}
        {!writable && <p>{m.readOnlyProject}</p>}
        {current !== null && file === null && <p>{m.unreadableNotice}</p>}
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
          {current !== null && file !== null ? (
            <CanvasSurface
              key={current.fileName}
              canvas={file}
              services={cards}
              editable={writable}
              newId={canvases.newId}
              onEdits={(edits) =>
                canvases.edit((now) => applyEdits(now, edits))
              }
              onViewport={(view) =>
                canvases.edit((now) => setViewport(now, view))
              }
              onUpdateVersion={(id, version) =>
                canvases.edit((now) => updatePinnedVersion(now, id, version))
              }
              registerSurface={canvases.registerSurface}
            />
          ) : (
            status !== "loading" && (
              <div className="canvas-view__empty">
                <p>{question === null ? m.noQuestions : m.unreadableNotice}</p>
                {question === null && <p>{m.noQuestionsHint}</p>}
              </div>
            )
          )}
        </div>
        {widths.right > 0 && (
          <>
            <Splitter
              label={m.resizeNotes}
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
              aria-labelledby="canvas-notes-heading"
            >
              <h3 id="canvas-notes-heading">{m.notesHeading}</h3>
              <NotesSummary
                file={file}
                resolve={cards.resolve}
                onSelectNote={canvases.focusNode}
              />
            </aside>
          </>
        )}
      </div>
    </section>
  );
}
