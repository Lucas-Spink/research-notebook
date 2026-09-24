import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewView, type PreviewViewProps } from "./PreviewView";
import type { PreviewState } from "./model/load";
import { SAMPLE_NOTEBOOK, SAMPLE_TABLE, SAMPLE_TEXT } from "./model/fakeApi";

const DETAILS = {
  name: "Volcano plot",
  fileName: "volcano.png",
  size: 1_536,
  location: "_notebook/experiments/EXP-001/evidence/volcano.png",
};

function props(
  state: PreviewState,
  extra: Partial<PreviewViewProps> = {},
): PreviewViewProps {
  return {
    details: DETAILS,
    plan: { kind: "image" },
    state,
    zoomed: false,
    onToggleZoom: vi.fn(),
    onExpand: vi.fn(),
    onRetry: vi.fn(),
    onRenderFailed: vi.fn(),
    onOpenExternally: vi.fn(),
    onOpenInVsCode: vi.fn(),
    ...extra,
  };
}

function render(p: PreviewViewProps): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(<PreviewView {...p} />);
  return container;
}

const buttonTexts = (root: HTMLElement) =>
  [...root.querySelectorAll("button")].map((b) => b.textContent);

const ready = (
  content: Extract<PreviewState, { status: "ready" }>["content"],
): PreviewState => ({
  status: "ready",
  content,
});

describe("PreviewView", () => {
  it("announces that the preview is loading", () => {
    const root = render(props({ status: "loading" }));
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      "Loading preview…",
    );
  });

  it("fits an image to the panel, with a button to see it at actual size", () => {
    const root = render(props(ready({ kind: "image", url: "asset://a" })));
    const img = root.querySelector("img");
    expect(img?.getAttribute("src")).toBe("asset://a");
    expect(img?.getAttribute("alt")).toBe("Preview of Volcano plot");
    expect(img?.className).toContain("preview__image--fit");
    const zoom = root.querySelector("button");
    expect(zoom?.textContent).toBe("Actual size");
    expect(zoom?.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows the header and rows of a table, with its dimensions once counted", () => {
    const root = render(
      props(ready({ kind: "table", table: SAMPLE_TABLE, expanded: false }), {
        plan: { kind: "table" },
      }),
    );
    const table = root.querySelector("table");
    expect(table?.querySelector("caption")?.textContent).toBe(
      "First rows of Volcano plot",
    );
    expect(
      [...root.querySelectorAll("th")].map((th) => th.textContent),
    ).toEqual(["gene", "count"]);
    expect(root.querySelectorAll("tbody tr")).toHaveLength(2);
    expect(root.textContent).toContain("2 rows, 2 columns");
    expect(buttonTexts(root)).toEqual([]);
  });

  it("offers more rows when there are some, and says when dimensions are not counted", () => {
    const table = {
      ...SAMPLE_TABLE,
      complete: false,
      moreRows: true,
      moreColumns: true,
      dimensions: null,
      encoding: "windows1252" as const,
    };
    const root = render(
      props(ready({ kind: "table", table, expanded: false }), {
        plan: { kind: "table" },
      }),
    );
    expect(buttonTexts(root)).toEqual(["Show up to 2,000 rows"]);
    expect(root.textContent).toContain("Showing the first 2 rows.");
    expect(root.textContent).toContain("dimensions are not shown");
    expect(root.textContent).toContain("Only the first 50 columns are shown.");
    expect(root.textContent).toContain("Read as Windows-1252.");

    const expanded = render(
      props(ready({ kind: "table", table, expanded: true }), {
        plan: { kind: "table" },
      }),
    );
    expect(buttonTexts(expanded)).toEqual([]);
  });

  it("shows text monospaced and says when it is cut short", () => {
    const text = { ...SAMPLE_TEXT, complete: false };
    const root = render(
      props(ready({ kind: "text", text }), { plan: { kind: "text" } }),
    );
    expect(root.querySelector("pre")?.textContent).toBe(
      "import numpy as np\nprint(np.pi)",
    );
    expect(root.textContent).toContain("Only the first 500 lines are shown.");
  });

  it("shows a notebook's details, language and kernel, and Open in VS Code", () => {
    const root = render(
      props(ready({ kind: "notebook", notebook: SAMPLE_NOTEBOOK }), {
        plan: { kind: "notebook" },
      }),
    );
    expect(root.textContent).toContain("Jupyter notebook");
    expect(root.textContent).toContain("python");
    expect(root.textContent).toContain("Python 3 (ipykernel)");
    expect(root.textContent).toContain("1.5 KB");
    expect(buttonTexts(root)).toEqual(["Open in VS Code"]);

    const bare = render(
      props(
        ready({
          kind: "notebook",
          notebook: { kind: "quarto", language: null, kernel: null },
        }),
        { plan: { kind: "notebook" } },
      ),
    );
    expect(bare.textContent).toContain("Not recorded");
  });

  it("shows type, size and location of other files, with Open with system application", () => {
    const root = render(
      props(ready({ kind: "other", reason: "type" }), {
        plan: { kind: "other", reason: "type" },
      }),
    );
    expect(root.textContent).toContain(
      "There is no preview for this type of file.",
    );
    expect(root.textContent).toContain("1.5 KB");
    expect(root.textContent).toContain(DETAILS.location);
    expect(buttonTexts(root)).toEqual(["Open with system application"]);
  });

  it("explains that linked artefacts are not previewed", () => {
    const root = render(
      props(ready({ kind: "other", reason: "linked" }), {
        plan: { kind: "other", reason: "linked" },
      }),
    );
    expect(root.textContent).toContain("This artefact is linked");
  });

  it("draws PDF pages on a labelled canvas", () => {
    const root = render(
      props(ready({ kind: "pdf", url: "asset://p" }), {
        plan: { kind: "pdf" },
      }),
    );
    expect(root.querySelector("canvas")?.getAttribute("aria-label")).toBe(
      "Preview of Volcano plot",
    );
  });

  it("shows a failure inline, with the recovery it calls for (FR-PRV-05)", () => {
    const transient = render(
      props({ status: "failed", failure: "fileUnavailable" }),
    );
    expect(transient.querySelector('[role="alert"]')?.textContent).toContain(
      "Another program may be using it.",
    );
    expect(buttonTexts(transient)).toEqual(["Try again"]);

    const lasting = render(
      props({ status: "failed", failure: "tooManyPixels" }),
    );
    expect(buttonTexts(lasting)).toEqual(["Open with system application"]);
  });
});

describe("PreviewView actions", () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    container?.remove();
    container = null;
  });

  function mount(p: PreviewViewProps): HTMLDivElement {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const div = document.createElement("div");
    document.body.append(div);
    container = div;
    const root = createRoot(div);
    act(() => root.render(<PreviewView {...p} />));
    return div;
  }

  const click = (el: Element | null | undefined) =>
    act(() => {
      el?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

  it("calls the recovery each failure offers", () => {
    const p = props({ status: "failed", failure: "internal" });
    click(mount(p).querySelector("button"));
    expect(p.onRetry).toHaveBeenCalledOnce();

    const q = props({ status: "failed", failure: "unreadable" });
    click(mount(q).querySelector("button"));
    expect(q.onOpenExternally).toHaveBeenCalledOnce();
  });

  it("expands a table, toggles zoom and opens notebooks in VS Code", () => {
    const table = props(
      ready({
        kind: "table",
        table: { ...SAMPLE_TABLE, moreRows: true },
        expanded: false,
      }),
      { plan: { kind: "table" } },
    );
    click(mount(table).querySelector("button"));
    expect(table.onExpand).toHaveBeenCalledOnce();

    const image = props(ready({ kind: "image", url: "asset://a" }));
    click(mount(image).querySelector("button"));
    expect(image.onToggleZoom).toHaveBeenCalledOnce();

    const notebook = props(
      ready({ kind: "notebook", notebook: SAMPLE_NOTEBOOK }),
      {
        plan: { kind: "notebook" },
      },
    );
    click(mount(notebook).querySelector("button"));
    expect(notebook.onOpenInVsCode).toHaveBeenCalledOnce();
  });

  it("reports an image the webview cannot draw", () => {
    const p = props(ready({ kind: "image", url: "asset://broken" }));
    const img = mount(p).querySelector("img");
    act(() => {
      img?.dispatchEvent(new Event("error"));
    });
    expect(p.onRenderFailed).toHaveBeenCalledOnce();
  });
});
