import { describe, expect, it } from "vitest";
import { parseDocument, serialiseDocument } from "./tiptap-markdown-nodes";

function roundTrips(markdown: string): boolean {
  return serialiseDocument(parseDocument(markdown)) === markdown;
}

describe("Tiptap artefactRef node (spec 5.6)", () => {
  it("round-trips copy mode with a version", () => {
    const text =
      '[PCA by treatment](evidence/pca_by_treatment.v2.pdf "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v2")';
    expect(roundTrips(text)).toBe(true);
  });

  it("round-trips link mode without a version", () => {
    const text =
      '[Raw counts](../../../data/counts.h5 "art:01JAXR9Q1W3E5R7T9Y1U3I5O7P")';
    expect(roundTrips(text)).toBe(true);
  });

  it("parses into the documented attrs shape", () => {
    const text =
      '[PCA by treatment](evidence/pca_by_treatment.v2.pdf "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v2")';
    const doc = parseDocument(text);
    const node = doc.content?.[0]?.content?.[0];

    expect(node).toEqual({
      type: "artefactRef",
      attrs: {
        ulid: "01JAXR5D8K2M4N6P8Q0R2S4T6V",
        version: 2,
        label: "PCA by treatment",
        target: "evidence/pca_by_treatment.v2.pdf",
      },
    });
  });

  it("parses link mode with version null", () => {
    const text =
      '[Raw counts](../../../data/counts.h5 "art:01JAXR9Q1W3E5R7T9Y1U3I5O7P")';
    const doc = parseDocument(text);
    const node = doc.content?.[0]?.content?.[0];

    expect(node?.attrs?.version).toBeNull();
  });
});

describe("Tiptap citation node (spec 5.7)", () => {
  it("round-trips a single citekey", () => {
    expect(roundTrips("[@z:u:7XK2PQ9M]")).toBe(true);
  });

  it("round-trips multiple citekeys with prefix and locator suffixes", () => {
    const text = "[see @z:u:9HJ3LM2N, fig. 2; @z:g4521:ABCD2345, pp. 10-12]";
    expect(roundTrips(text)).toBe(true);
  });

  it("round-trips the suppress-author form", () => {
    expect(roundTrips("[-@z:u:7XK2PQ9M]")).toBe(true);
  });

  it("parses into the documented attrs shape", () => {
    const text = "[see @z:u:9HJ3LM2N, fig. 2; @z:g4521:ABCD2345, pp. 10-12]";
    const doc = parseDocument(text);
    const node = doc.content?.[0]?.content?.[0];

    expect(node).toEqual({
      type: "citation",
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
    const doc = parseDocument("[-@z:u:7XK2PQ9M]");
    const node = doc.content?.[0]?.content?.[0];

    expect(node?.attrs?.items).toEqual([
      { prefix: "", suppressAuthor: true, citekey: "z:u:7XK2PQ9M", suffix: "" },
    ]);
  });
});

describe("artefactRef and citation nodes together in prose", () => {
  it("round-trips a paragraph mixing plain text, an artefact reference and a citation", () => {
    const text =
      'See [PCA by treatment](evidence/pca_by_treatment.v2.pdf "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v2") for details, cited in [@z:u:7XK2PQ9M].';
    expect(roundTrips(text)).toBe(true);
  });

  it("round-trips two artefact references in one paragraph", () => {
    const text =
      'Multiple: [A](a.png "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v1") and [B](b.png "art:01JAXR9Q1W3E5R7T9Y1U3I5O7P v3").';
    expect(roundTrips(text)).toBe(true);
  });
});
