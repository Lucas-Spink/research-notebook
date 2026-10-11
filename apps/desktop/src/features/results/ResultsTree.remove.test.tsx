import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sampleArtefacts } from "./model/sample";
import { ResultsTree } from "./ResultsTree";

/**
 * Removing a file from the notebook is in a result's actions, asks first
 * and says what will happen. The tree never removes anything itself: it
 * calls what it is given once the person confirms.
 */

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  document.body
    .querySelectorAll("[role=dialog], .results__popover")
    .forEach((e) => e.remove());
  container = null;
  root = null;
});

function mount(
  options: {
    onRemoveFile?: (id: string) => Promise<boolean>;
    removeWarning?: (id: string) => string;
    disabled?: boolean;
  } = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  const { onRemoveFile, removeWarning, disabled = false } = options;
  act(() =>
    root?.render(
      <ResultsTree
        file={sampleArtefacts()}
        disabled={disabled}
        onAction={() => Promise.resolve({ ok: true })}
        {...(onRemoveFile === undefined ? {} : { onRemoveFile })}
        {...(removeWarning === undefined ? {} : { removeWarning })}
      />,
    ),
  );
  return container;
}

function fileRow(view: HTMLElement, name: string): HTMLElement {
  const found = [...view.querySelectorAll('[role="treeitem"]')].find(
    (row) =>
      row.textContent === name && row.getAttribute("aria-expanded") === null,
  );
  if (!(found instanceof HTMLElement)) throw new Error(`no file row ${name}`);
  return found;
}

function openMenu(view: HTMLElement) {
  act(() => {
    fileRow(view, "Volcano plot").dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
  });
}

const menuButton = (label: string) =>
  [...document.body.querySelectorAll(".results__menu button")].find(
    (b) => b.textContent === label,
  );

const click = (element: Element | null | undefined) =>
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

describe("ResultsTree: removing a file from the notebook", () => {
  it("offers Remove from notebook only where files can be removed", () => {
    openMenu(mount());
    expect(menuButton("Remove from notebook…")).toBeUndefined();
  });

  it("asks first, with the warning it is given, and removes nothing until confirmed", () => {
    const onRemoveFile = vi.fn(() => Promise.resolve(true));
    const view = mount({
      onRemoveFile,
      removeWarning: () => "2 places refer to it.",
    });
    openMenu(view);
    click(menuButton("Remove from notebook…"));
    const text = document.body.textContent ?? "";
    expect(text).toContain("Remove Volcano plot from the notebook?");
    expect(text).toContain("2 places refer to it.");
    expect(text).toContain("can be restored");
    expect(onRemoveFile).not.toHaveBeenCalled();
  });

  it("removes that file when confirmed", async () => {
    const onRemoveFile = vi.fn(() => Promise.resolve(true));
    const view = mount({ onRemoveFile });
    openMenu(view);
    click(menuButton("Remove from notebook…"));
    const confirm = [...document.body.querySelectorAll("button")].find(
      (b) => b.textContent === "Remove from notebook",
    );
    click(confirm);
    await act(async () => Promise.resolve());
    expect(onRemoveFile).toHaveBeenCalledTimes(1);
    expect(onRemoveFile).toHaveBeenCalledWith(
      sampleArtefacts().artefacts.find((a) => a.name === "Volcano plot")?.id,
    );
  });

  it("says so when the file could not be removed", async () => {
    const onRemoveFile = vi.fn(() => Promise.resolve(false));
    const view = mount({ onRemoveFile });
    openMenu(view);
    click(menuButton("Remove from notebook…"));
    click(
      [...document.body.querySelectorAll("button")].find(
        (b) => b.textContent === "Remove from notebook",
      ),
    );
    await act(async () => Promise.resolve());
    expect(document.body.textContent).toContain("could not be removed");
  });
});
