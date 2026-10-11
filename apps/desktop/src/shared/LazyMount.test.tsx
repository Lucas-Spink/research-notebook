import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LazyMount } from "./LazyMount";

/**
 * Something costly, such as a picture, is drawn only once its place is near
 * the part of the list that is showing.
 */

let root: Root | null = null;
let place: HTMLElement | null = null;
afterEach(() => {
  act(() => root?.unmount());
  place?.remove();
  root = null;
  place = null;
  vi.unstubAllGlobals();
});

type Callback = (entries: { isIntersecting: boolean }[]) => void;

function stubObserver() {
  const state = { callback: null as Callback | null, disconnected: false };
  class FakeObserver {
    constructor(callback: Callback) {
      state.callback = callback;
    }
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {
      state.disconnected = true;
    }
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  return state;
}

function show() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  place = document.createElement("div");
  document.body.append(place);
  root = createRoot(place);
  act(() =>
    root?.render(
      <LazyMount placeholder={<i>waiting</i>}>
        <b>picture</b>
      </LazyMount>,
    ),
  );
  return place;
}

describe("LazyMount", () => {
  it("shows the placeholder until its place comes into view", () => {
    const observer = stubObserver();
    const view = show();
    expect(view.textContent).toBe("waiting");
    act(() => observer.callback?.([{ isIntersecting: false }]));
    expect(view.textContent).toBe("waiting");
    act(() => observer.callback?.([{ isIntersecting: true }]));
    expect(view.textContent).toBe("picture");
  });

  it("keeps what it drew once it has drawn it, so scrolling away does not discard it", () => {
    const observer = stubObserver();
    const view = show();
    act(() => observer.callback?.([{ isIntersecting: true }]));
    act(() => observer.callback?.([{ isIntersecting: false }]));
    expect(view.textContent).toBe("picture");
  });

  it("stops watching once it has drawn, and when it goes away", () => {
    const observer = stubObserver();
    show();
    act(() => observer.callback?.([{ isIntersecting: true }]));
    expect(observer.disconnected).toBe(true);
  });

  it("draws at once where nothing can tell it what is in view", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const view = show();
    expect(view.textContent).toBe("picture");
  });
});
