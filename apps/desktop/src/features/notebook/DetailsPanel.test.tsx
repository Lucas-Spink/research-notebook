import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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

function render(
  selected: Selected | null,
  overrides: { disabled?: boolean; writable?: boolean } = {},
): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <DetailsPanel
      selected={selected}
      questions={[]}
      sharedRefs={new Set()}
      actions={actions}
      disabled={overrides.disabled ?? false}
      writable={overrides.writable ?? true}
    />,
  );
  return container;
}

describe("DetailsPanel: the expanded view (S2-T12)", () => {
  it("shows the section editors alongside the frontmatter controls for a selected experiment", () => {
    const view = render(selectedExperiment);
    expect(view.querySelectorAll("textarea")).toHaveLength(3);
    expect(
      view.querySelector('button[aria-label="Edit EXP-001"]'),
    ).not.toBeNull();
  });

  it("shows no section editors when nothing, or a question, is selected", () => {
    expect(render(null).querySelectorAll("textarea")).toHaveLength(0);
    const selectedQuestion: Selected = {
      kind: "question",
      group: { question, readOnly: false, experiments: [] },
    };
    expect(render(selectedQuestion).querySelectorAll("textarea")).toHaveLength(
      0,
    );
  });

  it("keeps the section editors usable while an unrelated action is busy", () => {
    const view = render(selectedExperiment, { disabled: true, writable: true });
    for (const textarea of view.querySelectorAll("textarea")) {
      expect(textarea.hasAttribute("disabled")).toBe(false);
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
    for (const textarea of view.querySelectorAll("textarea")) {
      expect(textarea.hasAttribute("disabled")).toBe(true);
    }
  });
});
