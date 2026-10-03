import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { closeTabLabel, paneMessages } from "./messages";
import {
  MAX_PANE_WIDTH,
  MIN_PANE_WIDTH,
  type PaneAction,
  type PaneState,
  type PaneTab,
} from "./model/panes";
import "./PaneHost.css";

type Props = {
  state: PaneState;
  dispatch: (action: PaneAction) => void;
  /** The name a tab shows, and its close button names. */
  titleOf: (tab: PaneTab) => string;
  /** What the active tab holds. Only the active tab is rendered. */
  children: (tab: PaneTab) => ReactNode;
};

/** How far an arrow key moves the pane's edge, and with Shift held. */
const KEY_STEP = 20;
const KEY_STEP_LARGE = 80;

/**
 * The one side pane, like a tab group in Obsidian (S6-T01): it sits beside
 * the table, which gives it room by shrinking rather than being covered.
 * Its left edge is a separator that is dragged, or moved by arrow keys, to
 * resize it. With no tabs it renders nothing, so the table has the full width.
 */
export function PaneHost({ state, dispatch, titleOf, children }: Props) {
  const panelId = useId();
  const start = useRef<{ x: number; width: number } | null>(null);
  const active = state.tabs.find((tab) => tab.id === state.activeId);
  if (active === undefined) return null;

  function onKeyDown(event: KeyboardEvent) {
    const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
    // The pane is on the right, so moving its edge left makes it wider.
    if (event.key === "ArrowLeft")
      dispatch({ type: "resize", width: state.width + step });
    else if (event.key === "ArrowRight")
      dispatch({ type: "resize", width: state.width - step });
    else if (event.key === "Home")
      dispatch({ type: "resize", width: MAX_PANE_WIDTH });
    else if (event.key === "End")
      dispatch({ type: "resize", width: MIN_PANE_WIDTH });
    else return;
    event.preventDefault();
  }

  return (
    <aside
      className="pane"
      aria-label={paneMessages.paneLabel}
      style={{ width: state.width }}
    >
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={paneMessages.resizeLabel}
        aria-valuemin={MIN_PANE_WIDTH}
        aria-valuemax={MAX_PANE_WIDTH}
        aria-valuenow={state.width}
        tabIndex={0}
        className="pane__resize"
        onKeyDown={onKeyDown}
        onPointerDown={(event) => {
          start.current = { x: event.clientX, width: state.width };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const from = start.current;
          if (from === null) return;
          dispatch({
            type: "resize",
            width: from.width + (from.x - event.clientX),
          });
        }}
        onPointerUp={() => {
          start.current = null;
        }}
        onPointerCancel={() => {
          start.current = null;
        }}
      />
      <div className="pane__bar">
        <div
          role="tablist"
          aria-label={paneMessages.tabsLabel}
          className="pane__tabs"
        >
          {state.tabs.map((tab) => {
            const selected = tab.id === active.id;
            return (
              <span
                key={tab.id}
                className={`pane__tab${selected ? " pane__tab--active" : ""}`}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  aria-controls={panelId}
                  className="pane__tab-name"
                  onClick={() => dispatch({ type: "activate", id: tab.id })}
                >
                  {titleOf(tab)}
                </button>
                <button
                  type="button"
                  className="pane__tab-close"
                  aria-label={closeTabLabel(titleOf(tab))}
                  onClick={() => dispatch({ type: "close", id: tab.id })}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </span>
            );
          })}
        </div>
        <button
          type="button"
          className="pane__close"
          onClick={() => dispatch({ type: "closeAll" })}
        >
          {paneMessages.closePane}
        </button>
      </div>
      <div role="tabpanel" id={panelId} className="pane__body">
        {children(active)}
      </div>
    </aside>
  );
}
