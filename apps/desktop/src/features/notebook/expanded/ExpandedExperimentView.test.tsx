import type { ArrangedExperiment } from "@research-notebook/format";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
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

function render(node: React.ReactElement): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(node);
  return container;
}

describe("ExpandedExperimentView", () => {
  it("shows an editor for Methods, Results notes and Interpretation, each labelled", () => {
    const view = render(
      <ExpandedExperimentView
        item={item()}
        disabled={false}
        onSaveSection={() => Promise.resolve({ ok: true })}
      />,
    );
    const labels = [...view.querySelectorAll("label")].map(
      (l) => l.textContent,
    );
    expect(labels).toEqual(["Methods", "Results notes", "Interpretation"]);
    expect(view.querySelectorAll("textarea")).toHaveLength(3);
  });

  it("puts Results notes and Interpretation in a shared side-by-side container (FR-TBL-07)", () => {
    const view = render(
      <ExpandedExperimentView
        item={item()}
        disabled={false}
        onSaveSection={() => Promise.resolve({ ok: true })}
      />,
    );
    const pair = view.querySelector(".expanded__pair");
    expect(pair?.querySelectorAll("textarea")).toHaveLength(2);
    expect(pair?.querySelector("label")?.textContent).toBe("Results notes");
    // Methods is not inside the side-by-side pair.
    expect(
      view.querySelectorAll("textarea")[0]?.closest(".expanded__pair"),
    ).toBeNull();
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
    const view = render(
      <ExpandedExperimentView
        item={withText}
        disabled={false}
        onSaveSection={() => Promise.resolve({ ok: true })}
      />,
    );
    expect(view.querySelector("textarea")?.textContent).toBe(
      "PCA on normalised counts.",
    );
  });

  it("disables every field when asked, e.g. a read-only project", () => {
    const view = render(
      <ExpandedExperimentView
        item={item()}
        disabled={true}
        onSaveSection={() => Promise.resolve({ ok: true })}
      />,
    );
    for (const textarea of view.querySelectorAll("textarea")) {
      expect(textarea.hasAttribute("disabled")).toBe(true);
    }
  });

  it("shows no editors for an experiment that is read-only because another file has its ID", () => {
    const view = render(
      <ExpandedExperimentView
        item={item({ readOnly: true })}
        disabled={false}
        onSaveSection={() => Promise.resolve({ ok: true })}
      />,
    );
    expect(view.querySelectorAll("textarea")).toHaveLength(0);
    expect(view.textContent).toContain("Read-only");
  });

  it("shows every editor as Saved to start with", () => {
    const view = render(
      <ExpandedExperimentView
        item={item()}
        disabled={false}
        onSaveSection={() => Promise.resolve({ ok: true })}
      />,
    );
    for (const status of view.querySelectorAll('[role="status"]')) {
      expect(status.textContent).toBe("Saved");
    }
  });
});
