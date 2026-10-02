import { describe, expect, it } from "vitest";
import { citationClusters, citationContext } from "./citationContext";

const key = (citekey: string) => ({
  prefix: "",
  suppressAuthor: false,
  citekey,
  suffix: "",
});

describe("citationClusters (FR-CIT-09)", () => {
  it("returns clusters in document order, including every item of each", () => {
    const clusters = citationClusters(
      "First [@z:u:AAAA2222]. Then [see @z:u:BBBB2222, fig. 2; -@z:u:CCCC3333].",
    );
    expect(clusters).toEqual([
      { items: [key("z:u:AAAA2222")] },
      {
        items: [
          {
            prefix: "see ",
            suppressAuthor: false,
            citekey: "z:u:BBBB2222",
            suffix: "fig. 2",
          },
          { ...key("z:u:CCCC3333"), suppressAuthor: true },
        ],
      },
    ]);
  });

  it("includes hand-written author-in-text citations, with the locator as suffix", () => {
    const clusters = citationClusters("As @z:u:AAAA2222 [p. 4] showed.");
    expect(clusters).toEqual([
      { items: [{ ...key("z:u:AAAA2222"), suffix: "p. 4" }] },
    ]);
  });

  it("finds citations nested in lists and block quotes", () => {
    const clusters = citationClusters(
      "- one [@z:u:AAAA2222]\n- two\n  - deeper [@z:u:BBBB2222]\n\n> quoted [@z:u:CCCC3333]",
    );
    expect(clusters.map((c) => c.items[0]?.citekey)).toEqual([
      "z:u:AAAA2222",
      "z:u:BBBB2222",
      "z:u:CCCC3333",
    ]);
  });

  it("finds citations inside a block the editor keeps as raw passthrough", () => {
    const table = "| a | b |\n| - | - |\n| x [@z:u:AAAA2222] | y |";
    expect(citationClusters(table).map((c) => c.items[0]?.citekey)).toEqual([
      "z:u:AAAA2222",
    ]);
  });

  it("ignores bracketed text that is not a valid citation", () => {
    expect(citationClusters("[@not a key] and [plain] and a@b.com")).toEqual(
      [],
    );
  });

  it("returns nothing for an empty section", () => {
    expect(citationClusters("")).toEqual([]);
  });
});

describe("citationContext (FR-CIT-09)", () => {
  const body = (methods: string, interpretation: string) => ({
    preamble: "",
    sections: [
      { key: "interpretation" as const, body: interpretation },
      { key: "results_notes" as const, body: "[@z:u:NOTE2222]" },
      { key: "methods" as const, body: methods },
    ],
    literature: null,
  });

  it("reads Methods, then Interpretation, whatever order the file stores them in", () => {
    const clusters = citationContext(
      body("m [@z:u:METH2222]", "i [@z:u:INTP3333]"),
    );
    expect(clusters.map((c) => c.items[0]?.citekey)).toEqual([
      "z:u:METH2222",
      "z:u:INTP3333",
    ]);
  });

  it("never reads Results notes", () => {
    const clusters = citationContext(body("", ""));
    expect(clusters).toEqual([]);
  });

  it("treats a missing section as empty", () => {
    const clusters = citationContext({
      preamble: "",
      sections: [],
      literature: null,
    });
    expect(clusters).toEqual([]);
  });
});
