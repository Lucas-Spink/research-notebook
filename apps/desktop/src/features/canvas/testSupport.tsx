import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import type { ArtefactNode } from "./model/nodes";
import type { CardServices, FoundResult, ResultInfo } from "./model/results";
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

/** A result as a card shows it, with the parts a test does not care about filled in. */
export function foundResult(over: Partial<FoundResult> = {}): FoundResult {
  return {
    status: "found",
    artefactId: "01JAXA000000000000000000A1",
    name: "PCA plot",
    type: "image",
    experimentRef: "EXP-001",
    experimentTitle: "One",
    experimentFolder: "EXP-001",
    mode: "copy",
    shownVersion: 1,
    latestVersion: 1,
    fileName: "evidence/pca.png",
    sha256: "a".repeat(64),
    captured: true,
    ...over,
  };
}

/** Card services over a fixed answer for each artefact, recording what was opened. */
export function fakeCards(
  answers: Record<string, ResultInfo> = {},
): CardServices & { opened: [string, number | null][] } {
  const opened: [string, number | null][] = [];
  return {
    opened,
    resolve: (node: ArtefactNode) =>
      answers[node.artefact_id] ?? { status: "missing", reason: "artefact" },
    renderPreview: (result) => <span>picture of {result.name}</span>,
    onOpen: (result) => opened.push([result.artefactId, result.shownVersion]),
  };
}
