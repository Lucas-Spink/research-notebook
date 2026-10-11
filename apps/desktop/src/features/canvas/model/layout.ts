/** How wide a side panel may be, in CSS pixels. */
export type PanelLimits = { min: number; max: number; initial: number };

export const LEFT_LIMITS: PanelLimits = { min: 160, max: 480, initial: 260 };
export const RIGHT_LIMITS: PanelLimits = { min: 280, max: 720, initial: 400 };

/** The least width the canvas itself keeps, so it never disappears behind the panels. */
export const CENTRE_MIN = 320;

export type Side = "left" | "right";

export type LayoutState = {
  left: number;
  right: number;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
};

export const initialLayout: LayoutState = {
  left: LEFT_LIMITS.initial,
  right: RIGHT_LIMITS.initial,
  leftCollapsed: false,
  rightCollapsed: false,
};

export type LayoutAction =
  | { type: "resize"; side: Side; width: number }
  | { type: "nudge"; side: Side; delta: number }
  | { type: "toggle"; side: Side };

const limitsOf = (side: Side): PanelLimits =>
  side === "left" ? LEFT_LIMITS : RIGHT_LIMITS;

/** A width within the limits, whole pixels; anything that is not a number is the default. */
export function clampWidth(width: number, limits: PanelLimits): number {
  if (!Number.isFinite(width)) return limits.initial;
  return Math.min(limits.max, Math.max(limits.min, Math.round(width)));
}

function withSide(state: LayoutState, side: Side, width: number): LayoutState {
  const clamped = clampWidth(width, limitsOf(side));
  return side === "left"
    ? { ...state, left: clamped, leftCollapsed: false }
    : { ...state, right: clamped, rightCollapsed: false };
}

/** Resizing a panel opens it; collapsing keeps the width for when it is opened again. */
export function layoutReducer(
  state: LayoutState,
  action: LayoutAction,
): LayoutState {
  switch (action.type) {
    case "resize":
      return withSide(state, action.side, action.width);
    case "nudge":
      return withSide(state, action.side, state[action.side] + action.delta);
    case "toggle":
      return action.side === "left"
        ? { ...state, leftCollapsed: !state.leftCollapsed }
        : { ...state, rightCollapsed: !state.rightCollapsed };
  }
}

/**
 * The widths to draw in a container `total` pixels wide: nothing for a
 * collapsed panel, and never so much that the canvas has less than
 * `CENTRE_MIN`. The right panel gives way first, then the left.
 */
export function visibleWidths(
  state: LayoutState,
  total: number,
): { left: number; right: number } {
  const room = Math.max(0, total - CENTRE_MIN);
  const left = Math.min(state.leftCollapsed ? 0 : state.left, room);
  const right = Math.min(state.rightCollapsed ? 0 : state.right, room - left);
  return { left, right: Math.max(0, right) };
}
