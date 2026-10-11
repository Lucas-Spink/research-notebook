import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
export { stubFlowEnvironment } from "../../shared/flowTesting";

let mounted: { root: Root; place: HTMLDivElement } | null = null;

/** Renders `element` into the document and returns where it is. */
export function mount(element: ReactElement): HTMLDivElement {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const place = document.createElement("div");
  document.body.append(place);
  const root = createRoot(place);
  mounted = { root, place };
  act(() => root.render(element));
  return place;
}

export function unmount(): void {
  if (mounted === null) return;
  const { root, place } = mounted;
  act(() => root.unmount());
  place.remove();
  mounted = null;
}

/** Lets pending promises settle inside `act`. */
export const flush = () =>
  act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));

export const click = (element: Element | null | undefined) => {
  if (!element) throw new Error("nothing to click");
  act(() => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
};

export function buttonNamed(
  within: ParentNode,
  label: string,
): HTMLButtonElement {
  const found = [...within.querySelectorAll("button")].find(
    (button) => button.textContent === label,
  );
  if (found === undefined) throw new Error(`no button ${label}`);
  return found;
}

/** Types into a controlled input the way a person would. */
export function type(input: HTMLInputElement, text: string): void {
  act(() => {
    Reflect.set(HTMLInputElement.prototype, "value", text, input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
