import { describe, expect, it } from "vitest";
import { parseSectionMarkdown, serialiseSectionMarkdown } from "./markdown";

function roundTrips(markdown: string): boolean {
  return serialiseSectionMarkdown(parseSectionMarkdown(markdown)) === markdown;
}

describe("supported nodes and marks (FR-EDT-01)", () => {
  it("round-trips a plain paragraph", () => {
    expect(roundTrips("Just some prose.")).toBe(true);
  });

  it("round-trips bold and italic", () => {
    expect(roundTrips("This is **bold** and this is *italic*.")).toBe(true);
  });

  it("canonicalises underscore italics to asterisks, like the rest of the format", () => {
    expect(
      serialiseSectionMarkdown(parseSectionMarkdown("This is _italic_.")),
    ).toBe("This is *italic*.");
  });

  it("round-trips inline code", () => {
    expect(roundTrips("Run `pnpm check` first.")).toBe(true);
  });

  it("round-trips a bulleted list", () => {
    expect(roundTrips("- one\n- two\n- three")).toBe(true);
  });

  it("round-trips a numbered list", () => {
    expect(roundTrips("1. one\n2. two\n3. three")).toBe(true);
  });

  it("round-trips a link", () => {
    expect(
      roundTrips("See [the protocol](https://example.org/protocol)."),
    ).toBe(true);
  });

  it("round-trips level-3 and level-4 headings", () => {
    expect(roundTrips("### Sub-section\n\nSome text.")).toBe(true);
    expect(roundTrips("#### Detail\n\nSome text.")).toBe(true);
  });

  it("round-trips a block quote", () => {
    expect(roundTrips("> a quoted line")).toBe(true);
  });

  it("round-trips a fenced code block", () => {
    expect(roundTrips("```python\nprint('hi')\n```")).toBe(true);
  });

  it("parses a heading into a real, editable heading node", () => {
    const doc = parseSectionMarkdown("### Sub-section");
    expect(doc.content?.[0]).toEqual({
      type: "heading",
      attrs: { level: 3 },
      content: [{ type: "text", text: "Sub-section" }],
    });
  });

  it("round-trips mixed prose in one document", () => {
    const text = [
      "### Approach",
      "",
      "We used **bold** claims and *italic* hedging, with `inline code`.",
      "",
      "- step one",
      "- step two",
      "",
      "> a caveat",
    ].join("\n");
    expect(roundTrips(text)).toBe(true);
  });
});

describe("empty sections", () => {
  it("parses empty text into an empty paragraph", () => {
    expect(parseSectionMarkdown("")).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [] }],
    });
  });

  it("serialises an empty paragraph back to empty text", () => {
    expect(
      serialiseSectionMarkdown({
        type: "doc",
        content: [{ type: "paragraph", content: [] }],
      }),
    ).toBe("");
  });
});
