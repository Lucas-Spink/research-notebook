import type { ArrangedExperiment } from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { sampleNotebook } from "../model/fakeApi";
import { ExpandedExperimentView } from "./ExpandedExperimentView";

/**
 * S4-G08: "At most one editor instance mounted at any time." FR-EDT-03
 * read literally (ADR-0028): the expanded view shows Methods, Results
 * Notes and Interpretation together, but only one ever mounts a live
 * Tiptap/ProseMirror instance; the other two are a static rendering that
 * activates them. A mounted live editor always shows a `.ProseMirror`
 * element; a static section never does.
 */

const { state } = sampleNotebook();
const experiment = state.experiments[0];
if (experiment === undefined) throw new Error("sample");

const item: ArrangedExperiment = {
  experiment,
  readOnly: false,
  absentFromOrder: false,
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function mount() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ExpandedExperimentView
        item={item}
        disabled={false}
        onSaveSection={() => Promise.resolve({ ok: true })}
      />,
    ),
  );
  return container;
}

function fieldLabelled(view: HTMLElement, label: string): Element {
  const field = [...view.querySelectorAll(".expanded__field")].find(
    (candidate) => candidate.querySelector("label")?.textContent === label,
  );
  if (field === undefined) throw new Error(`no section labelled ${label}`);
  return field;
}

function activate(view: HTMLElement, label: string) {
  const button = fieldLabelled(view, label).querySelector('[role="button"]');
  if (button === null) throw new Error(`${label} is already live`);
  act(() => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("editor-instances (S4-G08)", () => {
  it("mounts exactly one editor instance when the view first opens", () => {
    const view = mount();
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(1);
  });

  it("mounts exactly one editor instance after activating Results Notes", () => {
    const view = mount();
    activate(view, "Results notes");
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(1);
    expect(
      fieldLabelled(view, "Results notes").querySelector(".ProseMirror"),
    ).not.toBeNull();
    expect(
      fieldLabelled(view, "Methods").querySelector(".ProseMirror"),
    ).toBeNull();
  });

  it("mounts exactly one editor instance after activating Interpretation, then switching back to Methods", () => {
    const view = mount();
    activate(view, "Interpretation");
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(1);
    activate(view, "Methods");
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(1);
    expect(
      fieldLabelled(view, "Methods").querySelector(".ProseMirror"),
    ).not.toBeNull();
  });

  it("mounts no editor instance at all for a read-only experiment", () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    act(() =>
      root?.render(
        <ExpandedExperimentView
          item={{ ...item, readOnly: true }}
          disabled={false}
          onSaveSection={() => Promise.resolve({ ok: true })}
        />,
      ),
    );
    expect(container.querySelectorAll(".ProseMirror")).toHaveLength(0);
  });
});
