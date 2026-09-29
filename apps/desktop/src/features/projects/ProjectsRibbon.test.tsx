import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectsRibbon, type RibbonTab } from "./ProjectsRibbon";

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function mount(props: {
  tab?: RibbonTab;
  expanded?: boolean;
  showRootsTab?: boolean;
  onTab?: (tab: RibbonTab) => void;
  onToggle?: () => void;
}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ProjectsRibbon
        tab={props.tab ?? "project"}
        expanded={props.expanded ?? true}
        showRootsTab={props.showRootsTab ?? false}
        onTab={props.onTab ?? (() => undefined)}
        onToggle={props.onToggle ?? (() => undefined)}
        projectPanel={<p>Project panel</p>}
        rootsPanel={<p>Roots panel</p>}
      />,
    ),
  );
  return container;
}

const tabs = (view: HTMLElement) =>
  [...view.querySelectorAll('[role="tab"]')].map((t) => t.textContent);

describe("ProjectsRibbon", () => {
  it("shows only the Project tab until a project is open", () => {
    const view = mount({ showRootsTab: false });
    expect(tabs(view)).toEqual(["Project"]);
  });

  it("shows both tabs once a project is open", () => {
    const view = mount({ showRootsTab: true });
    expect(tabs(view)).toEqual(["Project", "External roots"]);
  });

  it("shows no panel at all while collapsed", () => {
    const view = mount({ expanded: false });
    expect(view.querySelector('[role="tabpanel"]')).toBeNull();
  });

  it("shows the Project tab's own panel, not the other one", () => {
    const view = mount({ tab: "project", expanded: true });
    expect(view.textContent).toContain("Project panel");
    expect(view.textContent).not.toContain("Roots panel");
  });

  it("shows the External roots tab's own panel, not the other one", () => {
    const view = mount({ tab: "roots", showRootsTab: true, expanded: true });
    expect(view.textContent).toContain("Roots panel");
    expect(view.textContent).not.toContain("Project panel");
  });

  it("asks to switch tabs, and to toggle, on click", () => {
    const onTab = vi.fn();
    const onToggle = vi.fn();
    const view = mount({ showRootsTab: true, onTab, onToggle });

    const rootsTab = tabs(view).indexOf("External roots");
    const rootsTabButton = view.querySelectorAll('[role="tab"]')[rootsTab];
    act(() => {
      rootsTabButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onTab).toHaveBeenCalledWith("roots");

    const toggle = view.querySelector(".ribbon__toggle");
    act(() => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onToggle).toHaveBeenCalledOnce();
  });

  it("reflects the expanded state on the toggle button, with text kept for assistive tech", () => {
    const expanded = mount({ expanded: true });
    const expandedToggle = expanded.querySelector(".ribbon__toggle");
    expect(expandedToggle?.getAttribute("aria-expanded")).toBe("true");
    expect(expandedToggle?.textContent).toContain("Collapse the ribbon");

    const collapsed = mount({ expanded: false });
    const collapsedToggle = collapsed.querySelector(".ribbon__toggle");
    expect(collapsedToggle?.getAttribute("aria-expanded")).toBe("false");
    expect(collapsedToggle?.textContent).toContain("Expand the ribbon");
  });
});
