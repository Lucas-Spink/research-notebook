import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewView, type PreviewViewProps } from "./PreviewView";
import { CodeView } from "./CodeView";
import { SAMPLE_NOTEBOOK, SAMPLE_NOTEBOOK_JSON } from "./model/fakeApi";
import { parseNotebook } from "./model/notebook";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const roots: Root[] = [];

function mount(element: ReactElement): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  act(() => root.render(element));
  return container;
}

afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount());
  document.body.replaceChildren();
});

function type(input: HTMLInputElement, value: string) {
  act(() => {
    // Set through the prototype so React's value tracking sees the change.
    Reflect.set(HTMLInputElement.prototype, "value", value, input);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const click = (element: Element | null | undefined) =>
  act(() => {
    element?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

const button = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll("button")].find(
    (b) => b.textContent === label || b.getAttribute("aria-label") === label,
  );

const SCRIPT = {
  lines: [
    "import pandas as pd",
    "",
    "def run(x):",
    "    return pd.DataFrame(x)",
  ],
  encoding: "utf8" as const,
  complete: true,
};

describe("the code viewer (issue #104)", () => {
  const show = (over: Partial<Parameters<typeof CodeView>[0]> = {}) =>
    mount(
      <CodeView
        name="mebocost_analysis.py"
        text={SCRIPT}
        language="python"
        onOpenExternally={vi.fn()}
        {...over}
      />,
    );

  it("shows the file name, language and that it is read only", () => {
    const root = show();
    expect(root.textContent).toContain("mebocost_analysis.py");
    expect(root.textContent).toContain("Python");
    expect(root.textContent).toContain("Read only");
    expect(root.textContent).toContain("4 lines");
  });

  it("numbers the lines, and keeps the numbers out of what is copied", () => {
    const root = show();
    const numbers = [...root.querySelectorAll(".code__no")];
    expect(numbers.map((n) => n.textContent)).toEqual(["1", "2", "3", "4"]);
    expect(numbers.every((n) => n.getAttribute("aria-hidden") === "true")).toBe(
      true,
    );
    const code = [...root.querySelectorAll(".code__line")].map(
      (l) => l.textContent,
    );
    expect(code).toEqual([...SCRIPT.lines]);
  });

  it("preserves indentation", () => {
    const root = show();
    expect(root.querySelectorAll(".code__line")[3]?.textContent).toBe(
      "    return pd.DataFrame(x)",
    );
  });

  it("colours keywords", () => {
    const root = show();
    const keywords = [...root.querySelectorAll(".code__keyword")].map(
      (k) => k.textContent,
    );
    expect(keywords).toEqual(["import", "as", "def", "return"]);
  });

  it("cannot be edited", () => {
    const root = show();
    expect(root.querySelectorAll("textarea, [contenteditable]")).toHaveLength(
      0,
    );
  });

  it("finds text, counts the matches and steps through them", () => {
    const root = show();
    const input = root.querySelector<HTMLInputElement>('input[type="search"]');
    if (input === null) throw new Error("no search box");
    type(input, "pd");
    expect(root.querySelectorAll(".code__match")).toHaveLength(2);
    expect(root.querySelector('[role="status"]')?.textContent).toBe("1 of 2");
    click(button(root, "Next match"));
    expect(root.querySelector('[role="status"]')?.textContent).toBe("2 of 2");
    expect(root.querySelectorAll(".code__match--current")).toHaveLength(1);
    click(button(root, "Next match"));
    expect(root.querySelector('[role="status"]')?.textContent).toBe("1 of 2");
  });

  it("says when nothing matches", () => {
    const root = show();
    const input = root.querySelector<HTMLInputElement>('input[type="search"]');
    if (input === null) throw new Error("no search box");
    type(input, "zzz");
    expect(root.querySelector('[role="status"]')?.textContent).toBe(
      "No matches",
    );
    expect(button(root, "Next match")?.disabled).toBe(true);
  });

  it("wraps long lines only when asked", () => {
    const root = show();
    const body = root.querySelector(".code__body");
    expect(body?.classList.contains("code__body--wrap")).toBe(false);
    const wrap = root.querySelector<HTMLInputElement>('input[type="checkbox"]');
    click(wrap);
    expect(body?.classList.contains("code__body--wrap")).toBe(true);
  });

  it("opens the original file externally only when asked", () => {
    const open = vi.fn();
    const root = show({ onOpenExternally: open });
    expect(open).not.toHaveBeenCalled();
    click(button(root, "Open externally"));
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("says when the script is cut short, and when it is empty", () => {
    expect(
      show({ text: { ...SCRIPT, complete: false } }).textContent,
    ).toContain("Only the first 4 lines are shown.");
    const empty = show({
      text: { lines: [], encoding: "utf8", complete: true },
    });
    expect(empty.textContent).toContain("This script is empty.");
  });

  it("shows script text as text: markup in a comment is not markup", () => {
    const root = show({
      text: {
        lines: [
          '# <img src=x onerror="alert(1)">',
          "<script>alert(1)</script>",
        ],
        encoding: "utf8",
        complete: true,
      },
    });
    expect(root.querySelectorAll("img, script, iframe")).toHaveLength(0);
    expect(root.textContent).toContain("<script>alert(1)</script>");
  });

  it("names a non-UTF-8 encoding", () => {
    const root = show({ text: { ...SCRIPT, encoding: "windows1252" } });
    expect(root.textContent).toContain("Read as Windows-1252.");
  });
});

const DETAILS = {
  name: "Cell communication",
  fileName: "cell_communication.ipynb",
  size: 2_000,
  location: "_notebook/experiments/EXP-001/methods/cell_communication.ipynb",
};

function notebookView(text: string, over: Partial<PreviewViewProps> = {}) {
  const result = parseNotebook(text);
  return mount(
    <PreviewView
      details={DETAILS}
      plan={{ kind: "notebook", cells: true }}
      state={{
        status: "ready",
        content: {
          kind: "notebookCells",
          info: SAMPLE_NOTEBOOK,
          notebook: result,
        },
      }}
      zoomed={false}
      onToggleZoom={vi.fn()}
      onExpand={vi.fn()}
      onRetry={vi.fn()}
      onRenderFailed={vi.fn()}
      onOpenExternally={vi.fn()}
      onOpenInVsCode={vi.fn()}
      {...over}
    />,
  );
}

describe("the notebook viewer (issue #104)", () => {
  it("draws cells in order: Markdown formatted, code with its number and output", () => {
    const root = notebookView(SAMPLE_NOTEBOOK_JSON);
    const cells = [...root.querySelectorAll(".cell")];
    expect(cells).toHaveLength(2);
    expect(cells[0]?.querySelector("h3")?.textContent).toBe("Analysis");
    expect(cells[0]?.querySelector("strong")?.textContent).toBe("cells");
    expect(cells[1]?.textContent).toContain("In [1]:");
    expect(cells[1]?.querySelector(".cell__source")?.textContent).toContain(
      "print(1)",
    );
    expect(cells[1]?.querySelector(".cell__output")?.textContent).toBe("1\n");
    expect(root.textContent).toContain("2 cells");
    expect(root.textContent).toContain("nothing is run");
  });

  it("shows the notebook as cells, not as its JSON", () => {
    const root = notebookView(SAMPLE_NOTEBOOK_JSON);
    expect(root.textContent).not.toContain("nbformat");
    expect(root.textContent).not.toContain("cell_type");
  });

  it("folds and unfolds one cell, and all of them", () => {
    const root = notebookView(SAMPLE_NOTEBOOK_JSON);
    click(button(root, "Collapse cell 2"));
    expect(root.querySelectorAll(".cell__source")).toHaveLength(0);
    expect(button(root, "Expand cell 2")?.getAttribute("aria-expanded")).toBe(
      "false",
    );
    click(button(root, "Expand cell 2"));
    expect(root.querySelectorAll(".cell__source")).toHaveLength(1);
    click(button(root, "Collapse all cells"));
    expect(root.querySelectorAll(".cell > :not(.cell__bar)")).toHaveLength(0);
    click(button(root, "Expand all cells"));
    expect(root.querySelectorAll(".cell__source")).toHaveLength(1);
  });

  it("never draws script, HTML, images or links from a hostile notebook", () => {
    const hostile = JSON.stringify({
      nbformat: 4,
      metadata: {},
      cells: [
        {
          cell_type: "markdown",
          source: [
            '<script>alert(1)</script><img src=x onerror="alert(2)">\n',
            "[click](javascript:alert(3)) ![p](https://evil.example/p.png)",
          ],
        },
        {
          cell_type: "code",
          source: "x",
          outputs: [
            {
              output_type: "display_data",
              data: {
                "text/html": '<iframe src="https://evil.example"></iframe>',
                "image/png": "AAAA",
              },
            },
            {
              output_type: "display_data",
              data: { "text/html": "<script>alert(4)</script>" },
            },
          ],
        },
      ],
    });
    const root = notebookView(hostile);
    expect(
      root.querySelectorAll("script, img, iframe, object, embed, a, link"),
    ).toHaveLength(0);
    expect(root.innerHTML).not.toContain("data:");
    expect(root.textContent).toContain("is not shown here");
    // The link text is there, but it is not a link.
    expect(root.textContent).toContain("click");
  });

  it("says why a damaged notebook has no cells, and keeps its details", () => {
    const root = notebookView("{ broken");
    expect(root.querySelector('[role="alert"]')?.textContent).toContain(
      "not valid notebook JSON",
    );
    expect(root.textContent).toContain("Jupyter notebook");
    expect(root.querySelectorAll(".cell")).toHaveLength(0);
  });

  it("copes with hundreds of cells", () => {
    const many = JSON.stringify({
      nbformat: 4,
      metadata: {},
      cells: Array.from({ length: 400 }, (_, i) => ({
        cell_type: "code",
        source: `x = ${i}`,
        execution_count: i,
        outputs: [],
      })),
    });
    expect(notebookView(many).querySelectorAll(".cell")).toHaveLength(400);
  });
});
