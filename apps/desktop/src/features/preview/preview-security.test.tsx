// Gate S3-G09 (spec 6.7, 8) at component level: an SVG reaches the page only
// as the source of an <img>, which never runs its scripts, and an HTML
// artefact is never rendered, only offered for opening in the browser. The
// e2e form of this gate needs a WebDriver harness that does not exist yet
// (ADR-0038).
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { PreviewView, type PreviewViewProps } from "./PreviewView";
import { PreviewThumbnail } from "./PreviewThumbnail";
import type { PreviewState } from "./model/load";
import { loadPreview } from "./model/load";
import { planPreview } from "./model/plan";
import { fakePreviewApi, TARGET } from "./model/fakeApi";

// React's static renderer adds `<link rel="preload" as="image">` for each
// `<img>`, a fetch hint for the same URL, so only other links count.
const EMBEDDING =
  'svg, object, embed, iframe, frame, script, base, link:not([rel="preload"][as="image"])';

/** Every image preload points at `url`, and nothing else is preloaded. */
function expectOnlyImagePreloadsOf(root: HTMLElement, url: string) {
  for (const link of root.querySelectorAll("link")) {
    expect(link.getAttribute("href")).toBe(url);
  }
}

function props(
  state: PreviewState,
  plan: PreviewViewProps["plan"],
): PreviewViewProps {
  return {
    details: {
      name: "Report",
      fileName: "report.html",
      size: 10,
      location: "_notebook/experiments/EXP-001/evidence/report.html",
    },
    plan,
    state,
    zoomed: false,
    onToggleZoom: vi.fn(),
    onExpand: vi.fn(),
    onRetry: vi.fn(),
    onRenderFailed: vi.fn(),
    onOpenExternally: vi.fn(),
    onOpenInVsCode: vi.fn(),
  };
}

function render(node: React.ReactElement): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(node);
  return container;
}

describe("preview security (S3-G09)", () => {
  it("shows an SVG only as the source of an <img>, never inline or embedded", () => {
    const url = "asset://localhost/evil.svg";
    const root = render(
      <PreviewView
        {...props(
          { status: "ready", content: { kind: "svg", url } },
          { kind: "svg" },
        )}
      />,
    );
    const images = root.querySelectorAll("img");
    expect(images).toHaveLength(1);
    expect(images[0]?.getAttribute("src")).toBe(url);
    expect(root.querySelectorAll(EMBEDDING)).toHaveLength(0);
    expectOnlyImagePreloadsOf(root, url);
  });

  it("shows an SVG thumbnail the same way", () => {
    const root = render(
      <PreviewThumbnail
        name="Figure"
        thumbnail={{ kind: "image", url: "asset://t.svg" }}
      />,
    );
    expect(root.querySelectorAll("img")).toHaveLength(1);
    expect(root.querySelectorAll(EMBEDDING)).toHaveLength(0);
    expectOnlyImagePreloadsOf(root, "asset://t.svg");
  });

  it("never reads an SVG's text, so its markup cannot reach the page", async () => {
    const api = fakePreviewApi();
    await loadPreview(
      api,
      TARGET,
      planPreview({ fileName: "a.svg", type: "svg", captured: true }),
      false,
    );
    expect(api.calls.map((c) => c.command)).toEqual(["previewAsset:svg"]);
  });

  it("never renders an HTML artefact and offers only opening it in the browser", async () => {
    const plan = planPreview({
      fileName: "report.html",
      type: "html",
      captured: true,
    });
    const api = fakePreviewApi();
    const state = await loadPreview(api, TARGET, plan, false);
    expect(api.calls).toEqual([]);

    const p = props(state, plan);
    const root = render(<PreviewView {...p} />);
    expect(
      root.querySelectorAll(`${EMBEDDING}, link, img, canvas, [srcdoc]`),
    ).toHaveLength(0);
    const buttons = [...root.querySelectorAll("button")];
    expect(buttons.map((b) => b.textContent)).toEqual(["Open in browser"]);

    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const live = document.createElement("div");
    document.body.append(live);
    act(() => createRoot(live).render(<PreviewView {...p} />));
    act(() => {
      live
        .querySelector("button")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(p.onOpenExternally).toHaveBeenCalledOnce();
    live.remove();
  });
});
