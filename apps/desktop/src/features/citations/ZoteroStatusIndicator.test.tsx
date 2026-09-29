import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ZoteroState } from "./model/status";
import { ZoteroStatusIndicator } from "./ZoteroStatusIndicator";

function render(state: ZoteroState | null): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <ZoteroStatusIndicator state={state} />,
  );
  return container;
}

describe("ZoteroStatusIndicator", () => {
  it("shows nothing before the first check answers", () => {
    expect(render(null).innerHTML).toBe("");
  });

  it("is announced as a status and names Zotero", () => {
    const container = render({ kind: "connected" });
    const status = container.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status?.textContent).toMatch(/Zotero/);
  });

  it("gives no guidance once connected", () => {
    const container = render({ kind: "connected" });
    expect(container.textContent).toMatch(/Connected/);
    expect(container.querySelector(".citations__guidance")).toBeNull();
  });

  it("gives guidance to enable the local API when disabled", () => {
    const container = render({ kind: "disabled" });
    expect(container.textContent).toMatch(/switched off/);
    const guidance = container.querySelector(".citations__guidance");
    expect(guidance?.textContent).toMatch(/Settings/);
    expect(guidance?.textContent).toMatch(/Advanced/);
  });

  it("gives guidance to open Zotero when not running", () => {
    const container = render({ kind: "notRunning" });
    expect(container.textContent).toMatch(/not detected/);
    expect(
      container.querySelector(".citations__guidance")?.textContent,
    ).toMatch(/Open Zotero/);
  });

  it("marks each state with its own dot class", () => {
    for (const kind of [
      "connected",
      "disabled",
      "notRunning",
      "unknown",
    ] as const) {
      const container = render({ kind });
      expect(
        container.querySelector(`.citations__dot--${kind}`),
        kind,
      ).not.toBeNull();
    }
  });
});
