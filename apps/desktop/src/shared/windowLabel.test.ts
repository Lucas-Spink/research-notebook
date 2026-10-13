import { describe, expect, it } from "vitest";
import { CANVAS_WINDOW, MAIN_WINDOW, currentWindowLabel } from "./windowLabel";

describe("currentWindowLabel", () => {
  it("is the main window where there is no Tauri window to ask", () => {
    expect(currentWindowLabel()).toBe(MAIN_WINDOW);
  });

  it("keeps the two labels distinct", () => {
    expect(CANVAS_WINDOW).not.toBe(MAIN_WINDOW);
  });
});
