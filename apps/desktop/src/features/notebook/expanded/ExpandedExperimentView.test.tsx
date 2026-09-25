import type { ArrangedExperiment } from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { sampleNotebook } from "../model/fakeApi";
import { ExpandedExperimentView } from "./ExpandedExperimentView";

const { state } = sampleNotebook();
const experiment = state.experiments[0];
if (experiment === undefined) throw new Error("sample");

const item = (
  overrides: Partial<ArrangedExperiment> = {},
): ArrangedExperiment => ({
  experiment,
  readOnly: false,
  absentFromOrder: false,
  ...overrides,
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
  props: Partial<React.ComponentProps<typeof ExpandedExperimentView>> = {},
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() =>
    root?.render(
      <ExpandedExperimentView
        item={item()}
        disabled={false}
        folder={1}
        onSaveSection={() => Promise.resolve({ ok: true })}
        {...props}
      />,
    ),
  );
  return container;
}

describe("ExpandedExperimentView", () => {
  it("shows all three sections, each labelled", () => {
    const view = mount();
    const labels = [...view.querySelectorAll("label")].map(
      (l) => l.textContent,
    );
    expect(labels).toEqual(["Methods", "Results notes", "Interpretation"]);
  });

  it("puts Results notes and Interpretation in a shared side-by-side container (FR-TBL-07)", () => {
    const view = mount();
    const pair = view.querySelector(".expanded__pair");
    expect(pair?.querySelector("label")?.textContent).toBe("Results notes");
    // Methods is not inside the side-by-side pair.
    expect(
      view.querySelectorAll("label")[0]?.closest(".expanded__pair"),
    ).toBeNull();
  });

  it("starts Methods as the one live editor, the other two static", () => {
    const view = mount();
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(1);
    const labelledMethods = [...view.querySelectorAll(".expanded__field")].find(
      (field) => field.querySelector("label")?.textContent === "Methods",
    );
    expect(labelledMethods?.querySelector(".ProseMirror")).not.toBeNull();
  });

  it("switches which section is live when a static one is activated, keeping exactly one live", () => {
    const view = mount();
    const resultsNotesButton = [...view.querySelectorAll(".expanded__field")]
      .find(
        (field) =>
          field.querySelector("label")?.textContent === "Results notes",
      )
      ?.querySelector('[role="button"]');
    if (resultsNotesButton === null || resultsNotesButton === undefined) {
      throw new Error("no static Results notes section");
    }
    act(() => {
      resultsNotesButton.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(1);
    const labelledResultsNotes = [
      ...view.querySelectorAll(".expanded__field"),
    ].find(
      (field) => field.querySelector("label")?.textContent === "Results notes",
    );
    expect(labelledResultsNotes?.querySelector(".ProseMirror")).not.toBeNull();
  });

  it("starts each editor from the experiment's own section text", () => {
    const withText: ArrangedExperiment = item({
      experiment: {
        ...experiment,
        file: {
          ...experiment.file,
          body: {
            ...experiment.file.body,
            sections: experiment.file.body.sections.map((s) =>
              s.key === "methods"
                ? { ...s, body: "PCA on normalised counts." }
                : s,
            ),
          },
        },
      },
    });
    const view = mount({ item: withText });
    expect(view.querySelector(".ProseMirror")?.textContent).toBe(
      "PCA on normalised counts.",
    );
  });

  it("disables the live editor and every static section when asked", () => {
    const view = mount({ disabled: true });
    expect(
      view.querySelector(".ProseMirror")?.getAttribute("contenteditable"),
    ).toBe("false");
    for (const button of view.querySelectorAll('[role="button"]')) {
      expect(button.getAttribute("tabindex")).toBe("-1");
    }
  });

  it("shows no sections for an experiment that is read-only because another file has its ID", () => {
    const view = mount({ item: item({ readOnly: true }) });
    expect(view.querySelectorAll(".ProseMirror")).toHaveLength(0);
    expect(view.querySelectorAll('[role="button"]')).toHaveLength(0);
    expect(view.textContent).toContain("Read-only");
  });

  it("shows every editor as Saved to start with", () => {
    const view = mount();
    for (const status of view.querySelectorAll('[role="status"]')) {
      expect(status.textContent).toBe("Saved");
    }
  });
});
