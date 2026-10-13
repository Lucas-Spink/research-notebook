import { getCurrentWindow } from "@tauri-apps/api/window";

/** The label of the window the application opens with. */
export const MAIN_WINDOW = "main";
/** The label of the pop-out canvas window (ADR-0066). */
export const CANVAS_WINDOW = "canvas";

/**
 * The label of the window this code is running in. Outside Tauri (tests, a
 * plain browser) there is no window to ask, and the answer is the main one.
 */
export function currentWindowLabel(): string {
  try {
    return getCurrentWindow().label;
  } catch {
    return MAIN_WINDOW;
  }
}
