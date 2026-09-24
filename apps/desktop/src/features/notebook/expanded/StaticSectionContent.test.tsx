import { parseSectionMarkdown } from "@research-notebook/format";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StaticSectionContent } from "./StaticSectionContent";

function render(markdown: string): HTMLElement {
  const container = document.createElement("div");
  container.innerHTML = renderToStaticMarkup(
    <StaticSectionContent doc={parseSectionMarkdown(markdown)} />,
  );
  return container;
}

describe("StaticSectionContent", () => {
  it("renders paragraphs, bold, italic and inline code", () => {
    const view = render("Some **bold**, *italic* and `code` text.");
    expect(view.querySelector("strong")?.textContent).toBe("bold");
    expect(view.querySelector("em")?.textContent).toBe("italic");
    expect(view.querySelector("code")?.textContent).toBe("code");
  });

  it("renders headings at levels 3 and 4", () => {
    const view = render("### Sub-section\n\n#### Detail");
    expect(view.querySelector("h3")?.textContent).toBe("Sub-section");
    expect(view.querySelector("h4")?.textContent).toBe("Detail");
  });

  it("renders block quotes, lists and links", () => {
    const view = render(
      "> a caveat\n\n- one\n- two\n\n[the protocol](https://example.org/protocol)",
    );
    expect(view.querySelector("blockquote")?.textContent).toBe("a caveat");
    expect(view.querySelectorAll("ul li")).toHaveLength(2);
    const link = view.querySelector("a");
    expect(link?.getAttribute("href")).toBe("https://example.org/protocol");
    expect(link?.textContent).toBe("the protocol");
  });

  it("renders a passthrough block's raw Markdown, labelled as not editable here", () => {
    const view = render("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(view.querySelector(".expanded__passthrough-text")?.textContent).toBe(
      "| a | b |\n| - | - |\n| 1 | 2 |",
    );
    expect(
      view.querySelector(".expanded__passthrough-label")?.textContent,
    ).toBe("Not editable here — kept as written");
  });
});
