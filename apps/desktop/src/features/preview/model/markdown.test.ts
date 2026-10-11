import { describe, expect, it } from "vitest";
import { parseMarkdown, type Block, type Inline } from "./markdown";

const first = (source: string): Block | undefined => parseMarkdown(source)[0];
const text = (value: string): Inline => ({ kind: "text", text: value });

describe("reading the Markdown of a notebook cell (issue #104)", () => {
  it("reads headings by level", () => {
    expect(first("## Cell communication")).toEqual({
      kind: "heading",
      level: 2,
      content: [text("Cell communication")],
    });
  });

  it("joins the lines of a paragraph and splits paragraphs at a blank line", () => {
    expect(parseMarkdown("one\ntwo\n\nthree")).toEqual([
      { kind: "paragraph", content: [text("one two")] },
      { kind: "paragraph", content: [text("three")] },
    ]);
  });

  it("reads bold, italic, code and links inside a line", () => {
    expect(first("a **b** *c* `d` [e](https://x.org)")).toEqual({
      kind: "paragraph",
      content: [
        text("a "),
        { kind: "strong", content: [text("b")] },
        text(" "),
        { kind: "emphasis", content: [text("c")] },
        text(" "),
        { kind: "code", text: "d" },
        text(" "),
        { kind: "link", content: [text("e")], href: "https://x.org" },
      ],
    });
  });

  it("shows an image as its description and never as an image", () => {
    expect(first("![a plot](https://x.org/p.png)")).toEqual({
      kind: "paragraph",
      content: [{ kind: "image", alt: "a plot" }],
    });
  });

  it("reads bulleted and numbered lists", () => {
    expect(parseMarkdown("- a\n- b")).toEqual([
      {
        kind: "list",
        ordered: false,
        items: [[text("a")], [text("b")]],
      },
    ]);
    expect(first("1. a\n2. b")).toMatchObject({ kind: "list", ordered: true });
  });

  it("keeps a fenced code block exactly, with its language", () => {
    expect(first("```python\nif x:\n    y\n```")).toEqual({
      kind: "code",
      language: "python",
      text: "if x:\n    y",
    });
  });

  it("keeps an unclosed fence to the end rather than losing text", () => {
    expect(first("```\nabc")).toEqual({
      kind: "code",
      language: null,
      text: "abc",
    });
  });

  it("reads a quote and a rule", () => {
    expect(first("> said")).toEqual({ kind: "quote", content: [text("said")] });
    expect(first("---")).toEqual({ kind: "rule" });
  });

  it("keeps HTML and script as plain text, never as markup", () => {
    const blocks = parseMarkdown(
      '<script>alert(1)</script>\n\n<img src=x onerror="a()">',
    );
    expect(blocks).toEqual([
      { kind: "paragraph", content: [text("<script>alert(1)</script>")] },
      { kind: "paragraph", content: [text('<img src=x onerror="a()">')] },
    ]);
  });

  it("gives nothing for empty source", () => {
    expect(parseMarkdown("")).toEqual([]);
    expect(parseMarkdown("\n\n")).toEqual([]);
  });

  it("does not stall on unmatched markers", () => {
    expect(first("**a *b `c [d](e")).toMatchObject({ kind: "paragraph" });
  });
});
