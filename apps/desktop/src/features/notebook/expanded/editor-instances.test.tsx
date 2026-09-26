import type {
  ArrangedExperiment,
  ReferenceIndex,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { LiveEditorHarness } from "../editing/liveEditorHarness";
import { sampleNotebook } from "../model/fakeApi";
import { ExpandedExperimentView } from "./ExpandedExperimentView";

const NO_REFERENCES: ReferenceIndex = new Map();

/**
 * S4-G08: "At most one editor instance mounted at any time across the
 * table and the expanded view." FR-EDT-03 as amended by ADR-0043: every
 * place that shows sections shares the application's one live editor, so
 * only one section anywhere mounts a live Tiptap/ProseMirror instance;
 * every other section is a static rendering that asks to become live. A
 * mounted live editor always shows a `.ProseMirror` element; a static
 * section never does.
 */

const { state } = sampleNotebook();
const experiment = state.experiments[0];
const other = state.experiments[1];
if (experiment === undefined || other === undefined) throw new Error("sample");

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

/** Mounts the view as a selection opens it, with Methods live (ADR-0043). */
function mount(shown: ArrangedExperiment = item) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <LiveEditorHarness
        items={[shown]}
        initial={{
          folder: shown.experiment.folder,
          section: "methods",
          surface: "details",
        }}
      >
        {(live) => (
          <ExpandedExperimentView
            item={shown}
            disabled={false}
            folder={1}
            projectId="01JAX9Q2B7N4M8T6V3W5Y1Z0KC"
            references={NO_REFERENCES}
            focusSection={null}
            live={live}
          />
        )}
      </LiveEditorHarness>,
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

  it("keeps one editor instance across two places that show sections, moving it to the one activated", () => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    const second: ArrangedExperiment = { ...item, experiment: other };
    const common = {
      disabled: false,
      folder: 1,
      projectId: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
      references: NO_REFERENCES,
      focusSection: null,
    };
    act(() =>
      root?.render(
        <LiveEditorHarness
          items={[item, second]}
          initial={{
            folder: experiment.folder,
            section: "methods",
            surface: "details",
          }}
        >
          {(live) => (
            <>
              <div id="first">
                <ExpandedExperimentView {...common} item={item} live={live} />
              </div>
              <div id="second">
                <ExpandedExperimentView {...common} item={second} live={live} />
              </div>
            </>
          )}
        </LiveEditorHarness>,
      ),
    );
    const firstPlace = container.querySelector("#first");
    const secondPlace = container.querySelector("#second");
    if (!(firstPlace instanceof HTMLElement)) throw new Error("no first");
    if (!(secondPlace instanceof HTMLElement)) throw new Error("no second");
    expect(container.querySelectorAll(".ProseMirror")).toHaveLength(1);
    expect(firstPlace.querySelectorAll(".ProseMirror")).toHaveLength(1);

    activate(secondPlace, "Interpretation");
    expect(container.querySelectorAll(".ProseMirror")).toHaveLength(1);
    expect(firstPlace.querySelectorAll(".ProseMirror")).toHaveLength(0);
    expect(
      fieldLabelled(secondPlace, "Interpretation").querySelector(
        ".ProseMirror",
      ),
    ).not.toBeNull();
  });

  it("mounts no editor instance at all for a read-only experiment", () => {
    const view = mount({ ...item, readOnly: true });
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(0);
  });
});
