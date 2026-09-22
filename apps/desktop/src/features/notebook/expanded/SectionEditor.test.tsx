import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AutosaveField } from "./model/useAutosave";
import { SectionEditor } from "./SectionEditor";

function field(overrides: Partial<AutosaveField> = {}): AutosaveField {
  return {
    text: "PCA on normalised counts.",
    status: "saved",
    message: null,
    onChange: () => undefined,
    onBlur: () => undefined,
    ...overrides,
  };
}

function render(node: React.ReactElement): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(node);
  return container;
}

describe("SectionEditor", () => {
  it("labels the field with the section name and shows its text", () => {
    const view = render(
      <SectionEditor label="Methods" field={field()} disabled={false} />,
    );
    const textarea = view.querySelector("textarea");
    expect(textarea?.textContent).toBe("PCA on normalised counts.");
    const id = textarea?.getAttribute("id") ?? "";
    expect(view.querySelector(`label[for="${id}"]`)?.textContent).toBe(
      "Methods",
    );
  });

  it("shows each of the four statuses in words, never by colour alone", () => {
    for (const status of ["saved", "saving", "unsaved", "error"] as const) {
      const view = render(
        <SectionEditor
          label="Methods"
          field={field({
            status,
            message: status === "error" ? "Try again." : null,
          })}
          disabled={false}
        />,
      );
      const indicator = view.querySelector('[role="status"]');
      expect(indicator?.textContent, status).toMatch(
        status === "saving"
          ? /Saving/
          : status === "error"
            ? /Error/
            : new RegExp(status, "i"),
      );
    }
  });

  it("names the error's reason in the status text", () => {
    const view = render(
      <SectionEditor
        label="Methods"
        field={field({
          status: "error",
          message: "Enter text without a heading.",
        })}
        disabled={false}
      />,
    );
    expect(view.querySelector('[role="status"]')?.textContent).toContain(
      "Enter text without a heading.",
    );
  });

  it("disables the field when asked, e.g. a read-only project", () => {
    const view = render(
      <SectionEditor label="Methods" field={field()} disabled={true} />,
    );
    expect(view.querySelector("textarea")?.hasAttribute("disabled")).toBe(true);
  });
});
