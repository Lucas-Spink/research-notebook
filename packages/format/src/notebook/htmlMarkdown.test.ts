import { describe, expect, it } from "vitest";
import { renderMarkdownHtml, type RefLinks } from "./htmlMarkdown";

const none: RefLinks = () => null;

describe("renderMarkdownHtml (FR-ARC-05)", () => {
  it("renders paragraphs, emphasis, code and lists", () => {
    const html = renderMarkdownHtml(
      "A **bold** and *slanted* word with `code`.\n\n- one\n- two\n\n1. first\n2. second",
      none,
    );
    expect(html).toContain("<p>A <strong>bold</strong> and <em>slanted</em>");
    expect(html).toContain("<code>code</code>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("one");
  });

  it("escapes text, so a researcher's wording cannot become markup", () => {
    const html = renderMarkdownHtml('5 < 6 & "quoted" <b>x</b>', none);
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;");
    expect(html).toContain("&amp;");
  });

  it("shows raw HTML and tables as escaped text, never as markup", () => {
    const html = renderMarkdownHtml(
      "<script>alert(1)</script>\n\n| a | b |\n| - | - |\n| 1 | 2 |",
      none,
    );
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<pre");
    expect(html).toContain("| a | b |");
  });

  it("links only to http, https and mailto addresses", () => {
    const html = renderMarkdownHtml(
      "[ok](https://example.org/a?b=1&c=2) [bad](javascript:alert(1)) [file](file:///etc/passwd)",
      none,
    );
    expect(html).toContain('href="https://example.org/a?b=1&amp;c=2"');
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("file:");
    expect(html).toContain("bad");
  });

  it("renders an artefact reference as a relative link when it can be resolved", () => {
    const ulid = "01JAXR5D8K2M4N6P8Q0R2S4T6V";
    const md = `See [PCA](evidence/pca.pdf "art:${ulid} v2") here.`;
    const seen: Array<[string, number | null]> = [];
    const html = renderMarkdownHtml(md, (id, version) => {
      seen.push([id, version]);
      return "../../experiments/EXP-001/evidence/pca.v2.pdf";
    });
    expect(seen).toEqual([[ulid, 2]]);
    expect(html).toContain(
      '<a href="../../experiments/EXP-001/evidence/pca.v2.pdf">PCA</a>',
    );
  });

  it("leaves an unresolved artefact reference as plain label text", () => {
    const ulid = "01JAXR5D8K2M4N6P8Q0R2S4T6V";
    const html = renderMarkdownHtml(`[PCA](x.pdf "art:${ulid}")`, none);
    expect(html).not.toContain("<a ");
    expect(html).toContain("PCA");
  });

  it("shows citations by citekey", () => {
    const html = renderMarkdownHtml("As shown [@z:u:7XK2PQ9M, p. 4].", none);
    expect(html).toContain("<cite>");
    expect(html).toContain("@z:u:7XK2PQ9M");
  });
});
