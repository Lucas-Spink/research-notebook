import { describe, expect, it } from "vitest";
import {
  CITATION_IN_TEXT_NODE_NAME,
  CITATION_NODE_NAME,
  buildCitationNode,
} from "./citation";
import {
  parseCitationMarkdown,
  parseSectionMarkdown,
  serialiseSectionMarkdown,
} from "./markdown";

function roundTrips(markdown: string): boolean {
  return serialiseSectionMarkdown(parseSectionMarkdown(markdown)) === markdown;
}

describe("citation cluster syntax (spec 5.7, FR-CIT-03)", () => {
  it("parses a single citekey into a citation node", () => {
    const doc = parseSectionMarkdown("[@z:u:7XK2PQ9M]");
    expect(doc.content?.[0]?.content?.[0]).toEqual({
      type: CITATION_NODE_NAME,
      attrs: {
        items: [
          {
            prefix: "",
            suppressAuthor: false,
            citekey: "z:u:7XK2PQ9M",
            suffix: "",
          },
        ],
      },
    });
  });

  it("parses a prefix, locator suffix and a second item into a citation node", () => {
    const doc = parseSectionMarkdown(
      "[see @z:u:9HJ3LM2N, fig. 2; @z:g4521:ABCD2345, pp. 10-12]",
    );
    expect(doc.content?.[0]?.content?.[0]).toEqual({
      type: CITATION_NODE_NAME,
      attrs: {
        items: [
          {
            prefix: "see ",
            suppressAuthor: false,
            citekey: "z:u:9HJ3LM2N",
            suffix: "fig. 2",
          },
          {
            prefix: "",
            suppressAuthor: false,
            citekey: "z:g4521:ABCD2345",
            suffix: "pp. 10-12",
          },
        ],
      },
    });
  });

  it("parses the suppress-author form", () => {
    const doc = parseSectionMarkdown("[-@z:u:7XK2PQ9M]");
    expect(doc.content?.[0]?.content?.[0]).toEqual({
      type: CITATION_NODE_NAME,
      attrs: {
        items: [
          {
            prefix: "",
            suppressAuthor: true,
            citekey: "z:u:7XK2PQ9M",
            suffix: "",
          },
        ],
      },
    });
  });

  it("round-trips every spec 5.7 example byte-identically", () => {
    expect(roundTrips("[@z:u:7XK2PQ9M]")).toBe(true);
    expect(
      roundTrips("[see @z:u:9HJ3LM2N, fig. 2; @z:g4521:ABCD2345, pp. 10-12]"),
    ).toBe(true);
    expect(roundTrips("[-@z:u:7XK2PQ9M]")).toBe(true);
  });

  it("round-trips a citation inline with surrounding prose", () => {
    expect(
      roundTrips(
        "PCA on variance-stabilised counts using DESeq2 [@z:u:7XK2PQ9M].",
      ),
    ).toBe(true);
  });

  it("leaves a bracket with no citekey as ordinary text", () => {
    // "[not a citation]" has no "@", so the citation tokenizer never even
    // looks at it; this only confirms it does not accidentally match. A
    // full round-trip is not asserted here: a hand-typed "["/"]" outside any
    // recognised construct is escaped by the generic text serialiser
    // regardless of citations, a pre-existing limitation this task does not
    // change.
    const doc = parseSectionMarkdown("[not a citation]");
    expect(doc.content?.[0]?.content?.[0]?.type).toBe("text");
  });

  it("leaves a bracket with an invalid citekey (bad item key alphabet) as ordinary text", () => {
    const doc = parseSectionMarkdown("[@z:u:not-a-key]");
    const node = doc.content?.[0]?.content?.[0];
    expect(node?.type).toBe("text");
  });

  it("leaves the whole cluster as ordinary text when only one of several items is invalid", () => {
    const doc = parseSectionMarkdown("[@z:u:7XK2PQ9M; @z:u:bad]");
    const node = doc.content?.[0]?.content?.[0];
    expect(node?.type).toBe("text");
  });
});

describe("buildCitationNode", () => {
  it("builds the JSON node for a set of items", () => {
    const items = [
      {
        prefix: "",
        suppressAuthor: false,
        citekey: "z:u:7XK2PQ9M",
        suffix: "",
      },
    ];
    expect(buildCitationNode(items)).toEqual({
      type: CITATION_NODE_NAME,
      attrs: { items },
    });
  });
});

describe("parseCitationMarkdown", () => {
  it("parses a bracketed cluster the picker composed into a citation node", () => {
    expect(parseCitationMarkdown("[@z:u:7XK2PQ9M]")).toEqual({
      type: CITATION_NODE_NAME,
      attrs: {
        items: [
          {
            prefix: "",
            suppressAuthor: false,
            citekey: "z:u:7XK2PQ9M",
            suffix: "",
          },
        ],
      },
    });
  });

  it("throws for text that is not exactly one citation cluster", () => {
    expect(() => parseCitationMarkdown("not a citation")).toThrow();
  });
});

describe("author-in-text citation syntax (spec 5.7)", () => {
  it("parses a bare citekey with no locator", () => {
    const doc = parseSectionMarkdown("As @z:u:7XK2PQ9M showed,");
    const node = doc.content?.[0]?.content?.find(
      (n) => n.type === CITATION_IN_TEXT_NODE_NAME,
    );
    expect(node).toEqual({
      type: CITATION_IN_TEXT_NODE_NAME,
      attrs: { citekey: "z:u:7XK2PQ9M", locator: null },
    });
  });

  it("parses a bare citekey with a bracketed locator", () => {
    const doc = parseSectionMarkdown("@z:u:7XK2PQ9M [p. 4] showed this.");
    expect(doc.content?.[0]?.content?.[0]).toEqual({
      type: CITATION_IN_TEXT_NODE_NAME,
      attrs: { citekey: "z:u:7XK2PQ9M", locator: "p. 4" },
    });
  });

  it("round-trips a bare citekey with a locator byte-identically (the escaping bug this task fixes)", () => {
    expect(roundTrips("@z:u:7XK2PQ9M [p. 4] showed this.")).toBe(true);
  });

  it("round-trips a bare citekey with no locator byte-identically", () => {
    expect(roundTrips("As @z:u:7XK2PQ9M showed, the effect held.")).toBe(true);
  });

  it("does not absorb a following, independent bracketed citation as a locator", () => {
    const doc = parseSectionMarkdown(
      "@z:u:7XK2PQ9M and [@z:u:9HJ3LM2N] disagree.",
    );
    const inText = doc.content?.[0]?.content?.[0];
    expect(inText).toEqual({
      type: CITATION_IN_TEXT_NODE_NAME,
      attrs: { citekey: "z:u:7XK2PQ9M", locator: null },
    });
    expect(roundTrips("@z:u:7XK2PQ9M and [@z:u:9HJ3LM2N] disagree.")).toBe(
      true,
    );
  });

  it("leaves an invalid bare citekey as ordinary text", () => {
    expect(roundTrips("Contact user@z:u:notreal for details.")).toBe(true);
  });
});
