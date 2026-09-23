import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ArtefactsFileModel } from "@research-notebook/format";
import { ResultsTree } from "./ResultsTree";
import { largeArtefacts, sampleArtefacts } from "./model/sample";

function render(file: ArtefactsFileModel, disabled = false): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <ResultsTree
      file={file}
      disabled={disabled}
      onAction={() => Promise.resolve({ ok: true })}
    />,
  );
  return container;
}

const items = (root: HTMLElement) =>
  [...root.querySelectorAll('[role="treeitem"]')].map((el) => ({
    text: el.textContent,
    level: el.getAttribute("aria-level"),
    pos: `${el.getAttribute("aria-posinset")}/${el.getAttribute("aria-setsize")}`,
    expanded: el.getAttribute("aria-expanded"),
    tab: el.getAttribute("tabindex"),
  }));

describe("ResultsTree", () => {
  it("renders groups, their artefacts and the Ungrouped area as an ARIA tree", () => {
    const root = render(sampleArtefacts());
    const tree = root.querySelector('[role="tree"]');
    expect(tree?.getAttribute("aria-label")).toBe("Result groups");
    expect(items(root)).toEqual([
      {
        text: "▾Figures2 artefacts, 1 group",
        level: "1",
        pos: "1/3",
        expanded: "true",
        tab: "0",
      },
      {
        text: "▾Supplementary1 artefact",
        level: "2",
        pos: "1/3",
        expanded: "true",
        tab: "-1",
      },
      { text: "Heatmap", level: "3", pos: "1/1", expanded: null, tab: "-1" },
      {
        text: "Volcano plot",
        level: "2",
        pos: "2/3",
        expanded: null,
        tab: "-1",
      },
      { text: "Heatmap", level: "2", pos: "3/3", expanded: null, tab: "-1" },
      {
        text: "▾Tables1 artefact",
        level: "1",
        pos: "2/3",
        expanded: "true",
        tab: "-1",
      },
      { text: "Counts", level: "2", pos: "1/1", expanded: null, tab: "-1" },
      {
        text: "▾Ungrouped1 artefact",
        level: "1",
        pos: "3/3",
        expanded: "true",
        tab: "-1",
      },
      {
        text: "Loose figure",
        level: "2",
        pos: "1/1",
        expanded: null,
        tab: "-1",
      },
    ]);
    expect(root.textContent).not.toContain("Pipeline");
  });

  it("shows a group of more than 50 items collapsed, with its count (FR-GRP-06)", () => {
    const root = render(largeArtefacts(120, 2));
    expect(items(root)).toEqual([
      expect.objectContaining({
        text: "▸Group 160 artefacts",
        expanded: "false",
      }),
      expect.objectContaining({
        text: "▸Group 260 artefacts",
        expanded: "false",
      }),
      expect.objectContaining({ text: "Ungrouped0 artefacts", expanded: null }),
    ]);
  });

  it("offers a new group form and dragging when writable", () => {
    const root = render(sampleArtefacts());
    expect(root.querySelector("form label")?.textContent).toBe("New group");
    const draggable = root.querySelectorAll(
      '[role="treeitem"][draggable="true"]',
    );
    expect(draggable).toHaveLength(8);
  });

  it("can be browsed but not changed when read-only", () => {
    const root = render(sampleArtefacts(), true);
    expect(root.querySelector("form")).toBeNull();
    expect(root.textContent).toContain("This project is read-only");
    expect(root.querySelectorAll('[draggable="true"]')).toHaveLength(0);
    expect(root.querySelector(`[role="tree"]`)).not.toBeNull();
  });
});
