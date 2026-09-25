import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArtefactSearchRow } from "./model/artefactSearch";
import { ArtefactAutocomplete, artefactOptionId } from "./ArtefactAutocomplete";

const ROWS: ArtefactSearchRow[] = [
  {
    id: "01PCA",
    label: "PCA by treatment",
    fileName: "pca.v2.csv",
    target: "evidence/pca.v2.csv",
    type: "table",
    groupPath: "Figures",
    version: 2,
  },
  {
    id: "01HEAT",
    label: "Heatmap",
    fileName: "heatmap.v1.png",
    target: "evidence/heatmap.v1.png",
    type: "image",
    groupPath: null,
    version: 1,
  },
];

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function mount(
  props: Partial<React.ComponentProps<typeof ArtefactAutocomplete>> = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ArtefactAutocomplete
        id="artefact-list"
        rows={ROWS}
        activeIndex={0}
        onHover={() => undefined}
        onSelect={() => undefined}
        {...props}
      />,
    ),
  );
  return container;
}

describe("ArtefactAutocomplete (FR-EDT-04)", () => {
  it("is an ARIA listbox with one option per row", () => {
    const view = mount();
    const list = view.querySelector('[role="listbox"]');
    expect(list?.id).toBe("artefact-list");
    expect(view.querySelectorAll('[role="option"]')).toHaveLength(2);
  });

  it("shows the label, type, group path and version of each row", () => {
    const view = mount();
    const options = view.querySelectorAll('[role="option"]');
    expect(options[0]?.textContent).toContain("PCA by treatment");
    expect(options[0]?.textContent).toContain("Table");
    expect(options[0]?.textContent).toContain("Figures");
    expect(options[0]?.textContent).toContain("v2");
  });

  it("shows Ungrouped for an artefact in no group", () => {
    const view = mount();
    expect(view.querySelectorAll('[role="option"]')[1]?.textContent).toContain(
      "Ungrouped",
    );
  });

  it("marks the active row aria-selected, and only that one", () => {
    const view = mount({ activeIndex: 1 });
    const options = view.querySelectorAll('[role="option"]');
    expect(options[0]?.getAttribute("aria-selected")).toBe("false");
    expect(options[1]?.getAttribute("aria-selected")).toBe("true");
  });

  it("gives each option the id artefactOptionId expects", () => {
    const view = mount();
    expect(
      view.querySelector(`#${artefactOptionId("artefact-list", 0)}`),
    ).not.toBeNull();
    expect(
      view.querySelector(`#${artefactOptionId("artefact-list", 1)}`),
    ).not.toBeNull();
  });

  it("shows the empty message when there are no rows", () => {
    const view = mount({ rows: [] });
    expect(view.querySelectorAll('[role="option"]')).toHaveLength(0);
    expect(view.textContent).toContain("No matching artefacts");
  });

  it("calls onHover with the row's index on mouse enter", () => {
    const onHover = vi.fn();
    const view = mount({ onHover });
    const option = view.querySelectorAll('[role="option"]')[1];
    // React derives onMouseEnter from the native, bubbling "mouseover".
    act(() => {
      option?.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    });
    expect(onHover).toHaveBeenCalledWith(1);
  });

  it("calls onSelect with the row on mousedown, and prevents the default", () => {
    const onSelect = vi.fn();
    const view = mount({ onSelect });
    const option = view.querySelectorAll('[role="option"]')[1];
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      option?.dispatchEvent(event);
    });
    expect(onSelect).toHaveBeenCalledWith(ROWS[1]);
    expect(event.defaultPrevented).toBe(true);
  });
});
