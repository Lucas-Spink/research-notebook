import { vi } from "vitest";

/**
 * What React Flow needs from a browser that jsdom does not have (its own
 * testing guide lists the same): a resize observer, a transform matrix and
 * an element with a size. Only canvas tests call this.
 */
export function stubFlowEnvironment(): void {
  class FakeResizeObserver {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  class FakeMatrix {
    m22 = 1;
    constructor(transform?: string) {
      const scale = /scale\(([\d.]+)\)/.exec(transform ?? "");
      if (scale?.[1] !== undefined) this.m22 = Number(scale[1]);
    }
  }
  vi.stubGlobal("ResizeObserver", FakeResizeObserver);
  vi.stubGlobal("DOMMatrixReadOnly", FakeMatrix);
  // Only the flow's own container is given a size; anything else keeps what it had.
  for (const property of ["offsetWidth", "offsetHeight"] as const) {
    const before = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      property,
    );
    Object.defineProperty(HTMLElement.prototype, property, {
      configurable: true,
      get(this: HTMLElement) {
        if (this.classList.contains("react-flow")) return 800;
        const inherited: unknown = before?.get?.call(this);
        return typeof inherited === "number" ? inherited : 0;
      },
    });
  }
}
