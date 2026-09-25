import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { oneQuestionOneExperiment } from "./model/searchFixtures";
import { SearchPanel } from "./SearchPanel";

const { arranged, experiment } = oneQuestionOneExperiment({
  methods: "We used a warm cache for every trial.",
});

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function mount(
  onOpenResult: (key: string, section: string | null) => void = () => undefined,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <SearchPanel
        arranged={arranged}
        folder={1}
        onOpenResult={onOpenResult}
      />,
    ),
  );
  return container;
}

function click(element: Element | null) {
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function open(view: HTMLElement) {
  click(view.querySelector("button"));
}

/** Sets a controlled input's value the way a person typing does: through
 * the native setter React itself overrides, so its change handler fires. */
function nativeSetValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
}

function typeQuery(view: HTMLElement, text: string) {
  const input = view.querySelector<HTMLInputElement>('input[type="search"]');
  if (input === null) throw new Error("no query input");
  act(() => {
    nativeSetValue(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

describe("SearchPanel (FR-SRC-01, FR-SRC-02)", () => {
  it("starts collapsed, with no query input shown", () => {
    const view = mount();
    expect(view.querySelector('input[type="search"]')).toBeNull();
  });

  it("shows the query input once opened", () => {
    const view = mount();
    open(view);
    expect(view.querySelector('input[type="search"]')).not.toBeNull();
  });

  it("shows grouped results with a field label and text as the person types", () => {
    const view = mount();
    open(view);
    typeQuery(view, "cache");
    const group = view.querySelector(".notebook__search-group");
    expect(group?.textContent).toContain(experiment.file.frontmatter.title);
    const hit = view.querySelector(".notebook__search-hit");
    expect(hit?.textContent).toContain("Methods");
    expect(hit?.textContent).toContain("cache");
  });

  it("shows nothing found for a query that matches nothing", () => {
    const view = mount();
    open(view);
    typeQuery(view, "nonexistentword");
    expect(view.textContent).toContain("No matches.");
  });

  it("opens the experiment at the matched section when a hit is activated", () => {
    const onOpenResult = vi.fn();
    const view = mount(onOpenResult);
    open(view);
    typeQuery(view, "cache");
    const hit = view.querySelector<HTMLButtonElement>(".notebook__search-hit");
    click(hit);
    expect(onOpenResult).toHaveBeenCalledWith(
      `experiment:${experiment.folder}`,
      "methods",
    );
  });

  it("opens with no section for a title match", () => {
    const onOpenResult = vi.fn();
    const view = mount(onOpenResult);
    open(view);
    typeQuery(view, experiment.file.frontmatter.title);
    const hit = view.querySelector<HTMLButtonElement>(".notebook__search-hit");
    click(hit);
    expect(onOpenResult).toHaveBeenCalledWith(
      `experiment:${experiment.folder}`,
      null,
    );
  });
});
