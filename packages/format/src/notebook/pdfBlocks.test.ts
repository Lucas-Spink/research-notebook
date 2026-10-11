import { describe, expect, it } from "vitest";
import { citationCursor } from "./exportCitations";
import { pdfBlocks, pdfInline } from "./pdfBlocks";

describe("pdfBlocks (FR-ARC-06)", () => {
  it("turns paragraphs with emphasis, strong text and code into blocks", () => {
    expect(pdfBlocks("A **bold** and *slanted* word with `code`.")).toEqual([
      {
        t: "p",
        c: [
          { t: "text", s: "A " },
          { t: "strong", c: [{ t: "text", s: "bold" }] },
          { t: "text", s: " and " },
          { t: "em", c: [{ t: "text", s: "slanted" }] },
          { t: "text", s: " word with " },
          { t: "code", s: "code" },
          { t: "text", s: "." },
        ],
      },
    ]);
  });

  it("keeps list structure, and where an ordered list starts", () => {
    const blocks = pdfBlocks("- one\n- two\n\n3. third\n4. fourth");
    expect(blocks.map((b) => b.t)).toEqual(["ul", "ol"]);
    const [bullets, ordered] = blocks;
    expect(bullets).toMatchObject({ t: "ul" });
    expect(bullets && "items" in bullets ? bullets.items : []).toHaveLength(2);
    expect(ordered).toMatchObject({ t: "ol", start: 3 });
  });

  it("shows raw HTML and tables as the text written, never as structure", () => {
    const blocks = pdfBlocks(
      "<script>alert(1)</script>\n\n| a | b |\n| - | - |\n| 1 | 2 |",
    );
    expect(blocks.map((b) => b.t)).toEqual(["raw", "raw"]);
    expect(JSON.stringify(blocks)).toContain("<script>alert(1)</script>");
  });

  it("links only to http, https and mailto addresses", () => {
    const [block] = pdfBlocks(
      "[ok](https://example.org/a) [bad](javascript:alert(1)) [file](file:///etc/passwd)",
    );
    const text = JSON.stringify(block);
    expect(text).toContain('"href":"https://example.org/a"');
    expect(text).not.toContain("javascript:");
    expect(text).not.toContain("file:");
    expect(text).toContain("bad");
  });

  it("shows a citation by its citekeys and an artefact reference by its label", () => {
    const [block] = pdfBlocks(
      'See [PCA](evidence/pca.pdf "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v2") [@z:u:7XK2PQ9M, p. 4].',
    );
    const text = JSON.stringify(block);
    expect(text).toContain('{"t":"cite","s":"[@z:u:7XK2PQ9M, p. 4]"}');
    expect(text).toContain('{"t":"text","s":"PCA"}');
    expect(text).not.toContain("evidence/pca.pdf");
  });

  it("maps a section's own headings below the page's", () => {
    const blocks = pdfBlocks("### Third\n\n#### Fourth");
    expect(blocks).toMatchObject([
      { t: "h", level: 3 },
      { t: "h", level: 4 },
    ]);
  });

  it("keeps a code block as written", () => {
    expect(pdfBlocks("```\nprint(1)\n```")).toEqual([
      { t: "code", text: "print(1)" },
    ]);
  });

  it("returns nothing for empty text", () => {
    expect(pdfBlocks("  \n")).toEqual([]);
  });
});

describe("pdfInline", () => {
  it("reads a numbered bibliography entry as text, not as a list", () => {
    const inline = pdfInline("1. Smith J. *A study of yeast*. 2020.");
    expect(inline).toEqual([
      { t: "text", s: "1. Smith J. " },
      { t: "em", c: [{ t: "text", s: "A study of yeast" }] },
      { t: "text", s: ". 2020." },
    ]);
  });
});

describe("pdfBlocks citations (FR-ARC-06, issue #102)", () => {
  const strings = (blocks: ReturnType<typeof pdfBlocks>) =>
    JSON.stringify(blocks);

  it("replaces each citation with its resolved text, in order", () => {
    const cursor = citationCursor(["[1]", "[2]"]);
    const blocks = pdfBlocks(
      "One [@z:u:AAAA2222] and two [@z:u:BBBB2222; @z:u:CCCC2222].",
      cursor,
    );
    const text = strings(blocks);
    expect(text).toContain('{"t":"text","s":"[1]"}');
    expect(text).toContain('{"t":"text","s":"[2]"}');
    expect(text).not.toContain("@z:u:");
  });

  it("shows an unresolved citation as a marked key, never a made-up number", () => {
    const text = strings(
      pdfBlocks("Claim [@z:u:GONE2222].", citationCursor([null])),
    );
    expect(text).toContain("[z:u:GONE2222?]");
  });

  it("resolves an author-in-text citation", () => {
    const cursor = citationCursor(["Smith (2020)"]);
    const text = strings(pdfBlocks("As @z:u:SMIT2222 showed.", cursor));
    expect(text).toContain("Smith (2020)");
    expect(text).not.toContain("@z:u:");
  });

  it("keeps later citations aligned past one shown as written", () => {
    // The table is raw text, so its citation is skipped, not drawn.
    const cursor = citationCursor(["[1]", "[2]", "[3]"]);
    const text = strings(
      pdfBlocks(
        "First [@z:u:AAAA2222].\n\n| a |\n| - |\n| [@z:u:BBBB2222] |\n\nLast [@z:u:CCCC2222].",
        cursor,
      ),
    );
    expect(text).toContain('"s":"[1]"');
    expect(text).toContain('"s":"[3]"');
    expect(text).not.toContain('"s":"[2]"');
  });

  it("is unchanged without a cursor", () => {
    expect(strings(pdfBlocks("See [@z:u:AAAA2222]."))).toContain(
      '{"t":"cite","s":"[@z:u:AAAA2222]"}',
    );
  });
});
