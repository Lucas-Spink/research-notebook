import { describe, expect, it } from "vitest";
import { PASSTHROUGH_NODE_NAME } from "./passthrough";
import { parseSectionMarkdown, serialiseSectionMarkdown } from "./markdown";

function roundTrips(markdown: string): boolean {
  return serialiseSectionMarkdown(parseSectionMarkdown(markdown)) === markdown;
}

describe("unsupported constructs become passthrough blocks (FR-EDT-02)", () => {
  it("round-trips a table byte-identically", () => {
    const text = ["| a | b |", "| - | - |", "| 1 | 2 |"].join("\n");
    expect(roundTrips(text)).toBe(true);
    const doc = parseSectionMarkdown(text);
    expect(doc.content?.[0]?.type).toBe(PASSTHROUGH_NODE_NAME);
  });

  it("round-trips a raw HTML block byte-identically", () => {
    const text = "<div>\n  <span>hi</span>\n</div>";
    expect(roundTrips(text)).toBe(true);
    const doc = parseSectionMarkdown(text);
    expect(doc.content?.[0]?.type).toBe(PASSTHROUGH_NODE_NAME);
  });

  it("round-trips a thematic break byte-identically", () => {
    const text = "---";
    expect(roundTrips(text)).toBe(true);
    const doc = parseSectionMarkdown(text);
    expect(doc.content?.[0]?.type).toBe(PASSTHROUGH_NODE_NAME);
  });

  it("round-trips a level-1 heading as passthrough, not an editable heading", () => {
    const text = "# Top level";
    expect(roundTrips(text)).toBe(true);
    const doc = parseSectionMarkdown(text);
    expect(doc.content?.[0]?.type).toBe(PASSTHROUGH_NODE_NAME);
  });

  it("round-trips a level-5 heading as passthrough", () => {
    const text = "##### Too deep";
    expect(roundTrips(text)).toBe(true);
    const doc = parseSectionMarkdown(text);
    expect(doc.content?.[0]?.type).toBe(PASSTHROUGH_NODE_NAME);
  });

  it("round-trips strikethrough text as passthrough, whole paragraph", () => {
    const text = "Some ~~struck~~ text.";
    expect(roundTrips(text)).toBe(true);
    const doc = parseSectionMarkdown(text);
    expect(doc.content?.[0]?.type).toBe(PASSTHROUGH_NODE_NAME);
  });

  it("round-trips an image as passthrough, whole paragraph", () => {
    const text = "See ![a chart](chart.png) above.";
    expect(roundTrips(text)).toBe(true);
    const doc = parseSectionMarkdown(text);
    expect(doc.content?.[0]?.type).toBe(PASSTHROUGH_NODE_NAME);
  });

  it("demotes a whole block quote containing a table, not just the table", () => {
    const text = ["> | a | b |", "> | - | - |", "> | 1 | 2 |"].join("\n");
    expect(roundTrips(text)).toBe(true);
    const doc = parseSectionMarkdown(text);
    expect(doc.content?.[0]?.type).toBe(PASSTHROUGH_NODE_NAME);
  });

  it("demotes a whole list containing a wrong-level heading in one item", () => {
    const text = "- one\n- # not allowed here\n- three";
    expect(roundTrips(text)).toBe(true);
    const doc = parseSectionMarkdown(text);
    expect(doc.content?.[0]?.type).toBe(PASSTHROUGH_NODE_NAME);
  });

  it("keeps other blocks around a passthrough block editable", () => {
    const text = [
      "Some prose before.",
      "",
      "---",
      "",
      "Some prose after.",
    ].join("\n");
    expect(roundTrips(text)).toBe(true);
    const doc = parseSectionMarkdown(text);
    expect(doc.content?.map((node) => node.type)).toEqual([
      "paragraph",
      PASSTHROUGH_NODE_NAME,
      "paragraph",
    ]);
  });

  it("never drops characters even when nothing in the text is representable", () => {
    const text = "| x |\n| - |\n| 1 |";
    const doc = parseSectionMarkdown(text);
    const rendered = serialiseSectionMarkdown(doc);
    expect(rendered).toBe(text);
  });
});
