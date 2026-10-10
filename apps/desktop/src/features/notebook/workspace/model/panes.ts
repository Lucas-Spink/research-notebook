import { assertNever } from "../../../../shared/assertNever";

/** The export and archive tools of the Export ribbon tab, each in its own pane tab. */
export type ExportSection =
  "pdf" | "html" | "machine" | "bundles" | "gitBundle" | "archive";

/** What a tab in the side pane shows. A result is one artefact of one experiment. */
export type PaneTab =
  | { id: string; kind: "sources" }
  | { id: string; kind: "search" }
  | { id: string; kind: "citations" }
  | { id: string; kind: "details" }
  | { id: string; kind: "integrity" }
  | { id: string; kind: "export"; section: ExportSection }
  | { id: string; kind: "addResult"; experimentFolder: string }
  | { id: string; kind: "results"; experimentFolder: string }
  | {
      id: string;
      kind: "result";
      experimentFolder: string;
      artefactId: string;
      /** The version to show; `null` for the latest, or for a linked file. */
      version: number | null;
    };

export type PaneState = {
  tabs: readonly PaneTab[];
  /** The tab shown; `null` exactly when there are no tabs and the pane is closed. */
  activeId: string | null;
  /** The pane's width in CSS pixels. */
  width: number;
  /** Folded into a narrow rail of icons, one per tab, so the table has the room; the tabs stay open. */
  minimised: boolean;
};

export type PaneAction =
  | { type: "open"; tab: PaneTab }
  | { type: "activate"; id: string }
  | { type: "close"; id: string }
  | { type: "closeAll" }
  | { type: "minimise" }
  | { type: "restore" }
  | { type: "resize"; width: number };

export const MIN_PANE_WIDTH = 280;
export const MAX_PANE_WIDTH = 1200;
export const DEFAULT_PANE_WIDTH = 440;

export const initialPanes: PaneState = {
  tabs: [],
  activeId: null,
  width: DEFAULT_PANE_WIDTH,
  minimised: false,
};

/** A width kept whole and inside the limits, and within what the window leaves for the table. */
export function clampPaneWidth(width: number, available?: number): number {
  if (!Number.isFinite(width)) return DEFAULT_PANE_WIDTH;
  const most =
    available === undefined
      ? MAX_PANE_WIDTH
      : Math.max(MIN_PANE_WIDTH, Math.min(MAX_PANE_WIDTH, available));
  return Math.min(most, Math.max(MIN_PANE_WIDTH, Math.round(width)));
}

/** The id of an experiment's Results browser tab. */
export function resultsTabId(experimentFolder: string): string {
  return `results:${experimentFolder}`;
}

/** The id of an experiment's Add result tab: adding to the same experiment again shows its tab. */
export function addResultTabId(experimentFolder: string): string {
  return `add:${experimentFolder}`;
}

/** The id a result's tab has: opening the same result again shows its tab instead of adding another. */
export function resultTabId(
  experimentFolder: string,
  artefactId: string,
): string {
  return `result:${experimentFolder}:${artefactId}`;
}

/**
 * The tabs of the one side pane (S6-T01). Opening a tab that is already
 * there activates it; closing the active tab activates its neighbour; closing
 * the last tab closes the pane, which gives the table its whole width back.
 */
export function panesReducer(state: PaneState, action: PaneAction): PaneState {
  switch (action.type) {
    case "open": {
      const known = state.tabs.some((tab) => tab.id === action.tab.id);
      return {
        ...state,
        tabs: known ? state.tabs : [...state.tabs, action.tab],
        activeId: action.tab.id,
        // Opening something shows it, so a folded pane unfolds.
        minimised: false,
      };
    }
    case "activate":
      return state.tabs.some((tab) => tab.id === action.id)
        ? { ...state, activeId: action.id, minimised: false }
        : state;
    case "close": {
      const at = state.tabs.findIndex((tab) => tab.id === action.id);
      if (at === -1) return state;
      const tabs = state.tabs.filter((tab) => tab.id !== action.id);
      const next = tabs[Math.min(at, tabs.length - 1)];
      return {
        ...state,
        tabs,
        activeId:
          state.activeId === action.id ? (next?.id ?? null) : state.activeId,
        minimised: tabs.length === 0 ? false : state.minimised,
      };
    }
    case "closeAll":
      return { ...state, tabs: [], activeId: null, minimised: false };
    case "minimise":
      return state.tabs.length === 0 ? state : { ...state, minimised: true };
    case "restore":
      return { ...state, minimised: false };
    case "resize":
      return { ...state, width: clampPaneWidth(action.width) };
    default:
      return assertNever(action);
  }
}
