import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PopOutButton } from "./PopOutButton";
import type { PopOut } from "./useCanvasPopOut";

let root: Root | null = null;
let place: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  place?.remove();
  root = null;
  place = null;
});

function mount(popOut: PopOut) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  place = document.createElement("div");
  document.body.append(place);
  root = createRoot(place);
  act(() => root?.render(<PopOutButton popOut={popOut} />));
  return place;
}

const state = (over: Partial<PopOut> = {}): PopOut => ({
  open: false,
  failed: false,
  popOut: () => Promise.resolve(),
  ...over,
});

describe("PopOutButton", () => {
  it("offers to open the canvas in its own window", () => {
    const view = mount(state());
    expect(view.querySelector("button")?.textContent).toBe("Pop out canvas");
  });

  it("asks for the window when it is pressed", () => {
    const popOut = vi.fn(() => Promise.resolve());
    const view = mount(state({ popOut }));
    act(() => {
      view
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(popOut).toHaveBeenCalledOnce();
  });

  it("brings the window to the front while it is open", () => {
    const view = mount(state({ open: true }));
    expect(view.querySelector("button")?.textContent).toBe(
      "Show canvas window",
    );
  });

  it("says when the window could not be opened", () => {
    const view = mount(state({ failed: true }));
    expect(view.querySelector('[role="alert"]')?.textContent).toContain(
      "could not be opened",
    );
  });

  it("says nothing when all is well", () => {
    expect(mount(state()).querySelector('[role="alert"]')).toBeNull();
  });
});
