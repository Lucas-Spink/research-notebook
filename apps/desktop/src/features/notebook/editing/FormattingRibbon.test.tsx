import { sectionEditorExtensions } from "@research-notebook/format";
import { Editor } from "@tiptap/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { FormattingRibbon } from "./FormattingRibbon";

/** Text formatting for whichever section editor is live (ADR-0043). */

function editor(): Editor {
  return new Editor({
    extensions: sectionEditorExtensions(),
    content: "<p>Some text</p>",
  });
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  container = null;
  root = null;
});

function render(instance: Editor | null): HTMLElement {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root?.render(<FormattingRibbon editor={instance} />));
  return container;
}

function button(view: HTMLElement, label: string): HTMLButtonElement {
  const found = [...view.querySelectorAll("button")].find(
    (b) => b.textContent === label,
  );
  if (found === undefined) throw new Error(`no "${label}" button`);
  return found;
}

/** Sets a controlled input's value the way a person typing does: through
 * the native setter React itself overrides, so its change handler fires. */
function nativeSetValue(input: HTMLInputElement, value: string): void {
  Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    "value",
  )?.set?.call(input, value);
}

describe("FormattingRibbon", () => {
  it("disables every command and shows a hint while no editor is live", () => {
    const view = render(null);
    for (const b of view.querySelectorAll("button")) {
      expect(b.hasAttribute("disabled")).toBe(true);
    }
    expect(view.querySelector(".ribbon__hint")).not.toBeNull();
  });

  it("toggles bold on the live editor and shows it pressed", () => {
    const live = editor();
    live.commands.selectAll();
    const view = render(live);
    const bold = button(view, "Bold");
    expect(bold.getAttribute("aria-pressed")).toBe("false");

    act(() => bold.click());

    expect(live.isActive("bold")).toBe(true);
    expect(bold.getAttribute("aria-pressed")).toBe("true");
  });

  it("toggles a heading level and shows it pressed", () => {
    const live = editor();
    const view = render(live);
    const heading3 = button(view, "Heading 3");

    act(() => heading3.click());

    expect(live.isActive("heading", { level: 3 })).toBe(true);
    expect(heading3.getAttribute("aria-pressed")).toBe("true");
  });

  it("inserts an @ to open the artefact reference autocomplete", () => {
    const live = editor();
    const view = render(live);

    act(() => button(view, "Artefact reference").click());

    expect(live.getText()).toContain("@");
  });

  it("adds a link from the inline form", () => {
    const live = editor();
    live.commands.selectAll();
    const view = render(live);

    act(() => button(view, "Link").click());
    const input = view.querySelector("input");
    if (input === null) throw new Error("no link input");
    act(() => {
      nativeSetValue(input, "https://example.org");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const form = view.querySelector("form");
    if (form === null) throw new Error("no link form");
    act(() => form.requestSubmit());

    expect(live.isActive("link")).toBe(true);
  });
});
