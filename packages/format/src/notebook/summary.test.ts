import { describe, expect, it } from "vitest";
import { summariseMarkdown } from "../index";

/** FR-TBL-05: table cells show plain, bounded summaries of Markdown. */

describe("summariseMarkdown", () => {
  it("leaves plain text alone and collapses every run of whitespace to one space", () => {
    expect(summariseMarkdown("Treatment groups separate along PC1.")).toBe(
      "Treatment groups separate along PC1.",
    );
    expect(summariseMarkdown("one\n\ntwo\r\nthree\t four   five")).toBe(
      "one two three four five",
    );
    expect(summariseMarkdown("")).toBe("");
    expect(summariseMarkdown(" \n\t ")).toBe("");
  });

  it("strips inline formatting but keeps the words", () => {
    expect(
      summariseMarkdown("**bold** and *italic* and _under_ and ~~gone~~"),
    ).toBe("bold and italic and under and gone");
    expect(summariseMarkdown("run `DESeq2::results()` twice")).toBe(
      "run DESeq2::results() twice",
    );
  });

  it("does not mistake arithmetic or identifiers for emphasis", () => {
    expect(summariseMarkdown("2 * 3 * 4 = 24")).toBe("2 * 3 * 4 = 24");
    expect(summariseMarkdown("use snake_case_names and my_var")).toBe(
      "use snake_case_names and my_var",
    );
  });

  it("drops heading, list and quote markers", () => {
    expect(
      summariseMarkdown("### Heading\n- a\n- b\n1. one\n2. two\n> quoted"),
    ).toBe("Heading a b one two quoted");
  });

  it("shows a link or an artefact reference as its label, and an image as its alt text", () => {
    expect(
      summariseMarkdown('see [the paper](https://example.org/x "Title") now'),
    ).toBe("see the paper now");
    expect(
      summariseMarkdown(
        '[PCA by treatment](<../../evidence/pca by treatment.pdf> "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v2")',
      ),
    ).toBe("PCA by treatment");
    expect(summariseMarkdown("![Volcano plot](plot.png)")).toBe("Volcano plot");
    expect(summariseMarkdown("[a\\[1\\]](x)")).toBe("a[1]");
  });

  it("keeps citations as they are written until they are rendered", () => {
    expect(
      summariseMarkdown(
        "as shown [@z:u:7XK2PQ9M] and [see @z:u:9HJ3LM2N, fig. 2]",
      ),
    ).toBe("as shown [@z:u:7XK2PQ9M] and [see @z:u:9HJ3LM2N, fig. 2]");
  });

  it("shows code as its text, without the fence", () => {
    expect(summariseMarkdown("```r\nx <- 1\ny <- x + 1\n```")).toBe(
      "x <- 1 y <- x + 1",
    );
    expect(summariseMarkdown("~~~\nplain\n~~~")).toBe("plain");
  });

  it("reduces raw HTML to its text and drops comments", () => {
    expect(summariseMarkdown('<div class="a">hello <b>there</b></div>')).toBe(
      "hello there",
    );
    expect(summariseMarkdown("before<!-- hidden -->after")).toBe("beforeafter");
    expect(summariseMarkdown("line<br>break")).toBe("line break");
    expect(summariseMarkdown("x < y and y > z")).toBe("x < y and y > z");
  });

  it("reduces a table to its cell text", () => {
    expect(summariseMarkdown("| a | b |\n| - | - |\n| 1 | 2 |")).toBe(
      "a b 1 2",
    );
  });

  it("removes the marker of a horizontal rule and of a literature block", () => {
    expect(summariseMarkdown("above\n\n---\n\nbelow")).toBe("above below");
    expect(summariseMarkdown("## Literature\n\n1. Love et al. (2014).")).toBe(
      "Literature Love et al. (2014).",
    );
  });

  it("keeps a character that was escaped", () => {
    expect(summariseMarkdown("\\*not emphasis\\* and \\[not a link\\]")).toBe(
      "*not emphasis* and [not a link]",
    );
  });

  it("is cut to the length asked for, ending in an ellipsis, and never splits a character", () => {
    const cut = summariseMarkdown("abcdefghijklmnopqrstuvwxyz", 10);
    expect(cut).toBe("abcdefghi…");
    expect([...cut]).toHaveLength(10);
    const emoji = summariseMarkdown("😀😀😀😀😀😀", 4);
    expect(emoji).toBe("😀😀😀…");
    expect(summariseMarkdown("short", 10)).toBe("short");
  });

  it("does not leave a trailing space before the ellipsis", () => {
    expect(summariseMarkdown("word another", 6)).toBe("word…");
  });

  it("copes with a very long text quickly and stays within the bound", () => {
    const long = "*".repeat(500_000) + "[".repeat(500_000) + " end";
    const result = summariseMarkdown(long, 200);
    expect([...result].length).toBeLessThanOrEqual(200);
  });

  it("never throws on unbalanced or odd input", () => {
    for (const text of [
      "*",
      "**",
      "[",
      "](",
      "[](",
      "![",
      "```",
      "<",
      "<!--",
      "|",
      "\\",
      "\uD800",
    ]) {
      expect(() => summariseMarkdown(text)).not.toThrow();
    }
  });
});
