import { describe, expect, it } from "vitest";
import { AUTHOR_DATE_STYLE, EN_US_LOCALE, NUMERIC_STYLE } from "./bundled";
import {
  renderLiterature,
  type CitationCluster,
  type LiteratureInput,
  type LiteratureSource,
} from "./literature";

const love: LiteratureSource = {
  id: "z:u:LOVE2222",
  type: "article-journal",
  title: "Moderated estimation of fold change and dispersion for RNA-seq data",
  "container-title": "Genome Biol.",
  author: [
    { family: "Love", given: "Michael I." },
    { family: "Huber", given: "Wolfgang" },
    { family: "Anders", given: "Simon" },
  ],
  issued: { "date-parts": [[2014]] },
};
const smith: LiteratureSource = {
  id: "z:u:SMIT2222",
  type: "book",
  title: "Widgets & <Gadgets>",
  author: [{ family: "Smith", given: "Jane" }],
  issued: { "date-parts": [[2020]] },
};
const adams: LiteratureSource = {
  id: "z:u:ADAM2222",
  type: "book",
  title: "A Study of Things",
  author: [{ family: "Adams", given: "Ann" }],
  issued: { "date-parts": [[2018]] },
};

const cite = (...keys: string[]): CitationCluster => ({
  items: keys.map((citekey) => ({
    prefix: "",
    suppressAuthor: false,
    citekey,
    suffix: "",
  })),
});

function input(
  clusters: CitationCluster[],
  styleXml = NUMERIC_STYLE,
  items = [love, smith, adams],
): LiteratureInput {
  return { clusters, items, styleXml, localeXml: EN_US_LOCALE };
}

function text(literature: LiteratureInput): string {
  const result = renderLiterature(literature);
  if (!result.ok) throw new Error(result.error.message);
  return result.value.text;
}

describe("renderLiterature (FR-CIT-10)", () => {
  it("writes the heading and one numbered entry per source, by first appearance", () => {
    const out = text(input([cite("z:u:SMIT2222"), cite("z:u:LOVE2222")]));
    expect(out).toBe(
      [
        "## Literature",
        "",
        "1. Smith, J. Widgets & <Gadgets>. (2020).",
        "2. Love, M. I., Huber, W. & Anders, S. Moderated estimation of fold change and dispersion for RNA-seq data. *Genome Biol.* (2014).",
      ].join("\n"),
    );
  });

  it("lists a source once however often it is cited", () => {
    const out = text(
      input([
        cite("z:u:SMIT2222"),
        cite("z:u:LOVE2222", "z:u:SMIT2222"),
        cite("z:u:SMIT2222"),
      ]),
    );
    expect(out.match(/Widgets/g)).toHaveLength(1);
    expect(out).toContain("2. Love");
  });

  it("numbers the items of one cluster in the order written", () => {
    const out = text(input([cite("z:u:LOVE2222", "z:u:SMIT2222")]));
    expect(out.indexOf("1. Love")).toBeGreaterThan(-1);
    expect(out.indexOf("2. Smith")).toBeGreaterThan(-1);
  });

  it("is empty when nothing is cited", () => {
    expect(text(input([]))).toBe("");
  });

  it("orders an author-date style as the style sorts, not by appearance", () => {
    const out = text(
      input([cite("z:u:SMIT2222"), cite("z:u:ADAM2222")], AUTHOR_DATE_STYLE),
    );
    expect(out.indexOf("Adams")).toBeLessThan(out.indexOf("Smith"));
  });

  it("keeps trashed and missing sources, which stay in bibliography.json", () => {
    const trashed = {
      ...smith,
      _zotero: { status: "trashed" },
    } satisfies LiteratureSource;
    expect(
      text(input([cite("z:u:SMIT2222")], NUMERIC_STYLE, [trashed])),
    ).toContain("Smith");
  });

  it("reports a citekey that is not in bibliography.json instead of dropping it silently", () => {
    const result = renderLiterature(
      input([cite("z:u:SMIT2222", "z:u:GONE2222")]),
    );
    expect(result.ok && result.value.unresolved).toEqual(["z:u:GONE2222"]);
    expect(result.ok && result.value.text).toContain("1. Smith");
  });

  it("returns an error, not a throw, for a style that is not valid CSL", () => {
    const result = renderLiterature(input([cite("z:u:SMIT2222")], "<nope"));
    expect(result.ok).toBe(false);
  });

  it("is deterministic: the same input gives the same text", () => {
    const literature = input([cite("z:u:SMIT2222"), cite("z:u:LOVE2222")]);
    expect(text(literature)).toBe(text(literature));
  });

  it("does not change its input", () => {
    const literature = input([cite("z:u:SMIT2222")]);
    const before = JSON.stringify(literature);
    renderLiterature(literature);
    expect(JSON.stringify(literature)).toBe(before);
  });
});
