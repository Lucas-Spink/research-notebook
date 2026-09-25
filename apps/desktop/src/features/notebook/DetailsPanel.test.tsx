import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { DetailsPanel, type Selected } from "./DetailsPanel";
import { sampleNotebook } from "./model/fakeApi";
import type { NotebookActions } from "./useNotebook";

const { state } = sampleNotebook();
const experiment = state.experiments[0];
if (experiment === undefined) throw new Error("sample");
const question = state.questions[0];
if (question === undefined) throw new Error("sample");

const actions: NotebookActions = {
  createQuestion: () => Promise.resolve(true),
  createExperiment: () => Promise.resolve(true),
  editQuestion: () => Promise.resolve(true),
  editExperiment: () => Promise.resolve(true),
  moveExperiment: () => Promise.resolve(true),
  removeExperiment: () => Promise.resolve(true),
  removeQuestion: () => Promise.resolve(true),
  refresh: () => Promise.resolve(),
  editExperimentSection: () => Promise.resolve({ ok: true }),
  changeSettings: () => undefined,
  resetColumns: () => undefined,
  setUnassignedCollapsed: () => undefined,
};

const selectedExperiment: Selected = {
  kind: "experiment",
  item: { experiment, readOnly: false, absentFromOrder: false },
};

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function render(
  selected: Selected | null,
  overrides: { disabled?: boolean; writable?: boolean } = {},
): HTMLElement {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <DetailsPanel
        selected={selected}
        questions={[]}
        sharedRefs={new Set()}
        actions={actions}
        disabled={overrides.disabled ?? false}
        writable={overrides.writable ?? true}
        folder={1}
        projectId={state.project.id}
        focusSection={null}
      />,
    ),
  );
  return container;
}

describe("DetailsPanel: the expanded view (S2-T12, S4-T01)", () => {
  it("shows the section editors alongside the frontmatter controls for a selected experiment", () => {
    const view = render(selectedExperiment);
    // Exactly one live editor (S4-G08); the other two sections are static.
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(1);
    expect(
      view.querySelectorAll('.expanded__field [role="button"]'),
    ).toHaveLength(2);
    expect(
      view.querySelector('button[aria-label="Edit EXP-001"]'),
    ).not.toBeNull();
  });

  it("shows no section editors when nothing, or a question, is selected", () => {
    expect(render(null).querySelectorAll(".expanded__field")).toHaveLength(0);
    const selectedQuestion: Selected = {
      kind: "question",
      group: { question, readOnly: false, experiments: [] },
    };
    expect(
      render(selectedQuestion).querySelectorAll(".expanded__field"),
    ).toHaveLength(0);
  });

  it("keeps the section editors usable while an unrelated action is busy", () => {
    const view = render(selectedExperiment, { disabled: true, writable: true });
    expect(
      view.querySelector(".ProseMirror")?.getAttribute("contenteditable"),
    ).toBe("true");
    for (const button of view.querySelectorAll(
      '.expanded__field [role="button"]',
    )) {
      expect(button.getAttribute("tabindex")).toBe("0");
    }
    // The frontmatter's own one-shot buttons do turn off while busy.
    expect(
      view
        .querySelector('button[aria-label="Edit EXP-001"]')
        ?.hasAttribute("disabled"),
    ).toBe(true);
  });

  it("disables the section editors when the project is read-only, busy or not", () => {
    const view = render(selectedExperiment, {
      disabled: false,
      writable: false,
    });
    expect(
      view.querySelector(".ProseMirror")?.getAttribute("contenteditable"),
    ).toBe("false");
    for (const button of view.querySelectorAll(
      '.expanded__field [role="button"]',
    )) {
      expect(button.getAttribute("tabindex")).toBe("-1");
    }
  });
});
