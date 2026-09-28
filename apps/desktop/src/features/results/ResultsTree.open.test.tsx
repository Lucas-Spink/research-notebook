import type { ArtefactsFileModel } from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleArtefacts } from "./model/sample";
import { ResultsTree } from "./ResultsTree";

/**
 * ADR-0044 point 4: the Results tree works like a small file browser, so a
 * file in it can be opened (previewed) by double-click, from its actions,
 * and by Enter in a read-only project, where nothing else can be done.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function mount(
  onOpen: (artefactId: string) => void,
  disabled = false,
  file: ArtefactsFileModel = sampleArtefacts(),
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ResultsTree
        file={file}
        disabled={disabled}
        onAction={() => Promise.resolve({ ok: true })}
        onOpen={onOpen}
      />,
    ),
  );
  return container;
}

/** The first row showing `name` that is an artefact, not a group. */
function fileRow(view: HTMLElement, name: string): HTMLElement {
  const found = [...view.querySelectorAll('[role="treeitem"]')].find(
    (row) =>
      row.textContent === name && row.getAttribute("aria-expanded") === null,
  );
  if (!(found instanceof HTMLElement)) throw new Error(`no file row ${name}`);
  return found;
}

const artefactIdOf = (file: ArtefactsFileModel, name: string) =>
  file.artefacts.find((a) => a.name === name)?.id;

describe("ResultsTree: opening a file", () => {
  it("opens a file on double-click", () => {
    const onOpen = vi.fn();
    const view = mount(onOpen);
    act(() => {
      fileRow(view, "Volcano plot").dispatchEvent(
        new MouseEvent("dblclick", { bubbles: true }),
      );
    });
    expect(onOpen).toHaveBeenCalledWith(
      artefactIdOf(sampleArtefacts(), "Volcano plot"),
    );
  });

  it("offers Preview first among a file's actions", () => {
    const onOpen = vi.fn();
    const view = mount(onOpen);
    act(() => {
      fileRow(view, "Volcano plot").dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    });
    const first = view.querySelector(".results__menu button");
    expect(first?.textContent).toBe("Preview");
    act(() => {
      first?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onOpen).toHaveBeenCalledWith(
      artefactIdOf(sampleArtefacts(), "Volcano plot"),
    );
  });

  it("opens a file with Enter in a read-only project, where it can still be looked at", () => {
    const onOpen = vi.fn();
    const view = mount(onOpen, true);
    act(() => {
      fileRow(view, "Volcano plot").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(onOpen).toHaveBeenCalledWith(
      artefactIdOf(sampleArtefacts(), "Volcano plot"),
    );
  });

  it("does not open a group", () => {
    const onOpen = vi.fn();
    const view = mount(onOpen);
    const group = view.querySelector('[role="treeitem"][aria-expanded]');
    act(() => {
      group?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    });
    expect(onOpen).not.toHaveBeenCalled();
  });
});
