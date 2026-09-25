import { describe, expect, it } from "vitest";
import { parseSectionMarkdown, serialiseSectionMarkdown } from "./markdown";
import { ARTEFACT_REF_NODE_NAME, buildArtefactRefNode } from "./artefactRef";

const COPY_ULID = "01JAXR5D8K2M4N6P8Q0R2S4T6V";
const LINK_ULID = "01JAXR9Q1W3E5R7T9Y1V3J5N7P";

function roundTrips(markdown: string): boolean {
  return serialiseSectionMarkdown(parseSectionMarkdown(markdown)) === markdown;
}

describe("artefact reference syntax (spec 5.6, FR-EDT-04 to FR-EDT-05)", () => {
  it("parses copy-mode syntax (with a version) into an artefactRef node", () => {
    const doc = parseSectionMarkdown(
      `[PCA by treatment](evidence/pca_by_treatment.v2.pdf "art:${COPY_ULID} v2")`,
    );
    expect(doc.content?.[0]?.content?.[0]).toEqual({
      type: ARTEFACT_REF_NODE_NAME,
      attrs: {
        ulid: COPY_ULID,
        version: 2,
        label: "PCA by treatment",
        target: "evidence/pca_by_treatment.v2.pdf",
      },
    });
  });

  it("parses link-mode syntax (no version) into an artefactRef node", () => {
    const doc = parseSectionMarkdown(
      `[Raw counts](../../../data/counts.h5 "art:${LINK_ULID}")`,
    );
    expect(doc.content?.[0]?.content?.[0]).toEqual({
      type: ARTEFACT_REF_NODE_NAME,
      attrs: {
        ulid: LINK_ULID,
        version: null,
        label: "Raw counts",
        target: "../../../data/counts.h5",
      },
    });
  });

  it("round-trips copy-mode syntax byte-identically", () => {
    expect(
      roundTrips(
        `[PCA by treatment](evidence/pca_by_treatment.v2.pdf "art:${COPY_ULID} v2")`,
      ),
    ).toBe(true);
  });

  it("round-trips link-mode syntax byte-identically", () => {
    expect(
      roundTrips(`[Raw counts](../../../data/counts.h5 "art:${LINK_ULID}")`),
    ).toBe(true);
  });

  it("leaves a link whose title does not start with art: as an ordinary link", () => {
    const doc = parseSectionMarkdown(
      'See [the protocol](https://example.org/protocol "a plain title").',
    );
    const textNode = doc.content?.[0]?.content?.[1];
    expect(textNode?.type).toBe("text");
    expect(textNode?.marks?.[0]).toEqual({
      type: "link",
      attrs: {
        href: "https://example.org/protocol",
        title: "a plain title",
      },
    });
  });

  it("leaves a link with an art: title but no title at all as an ordinary link", () => {
    // No title in parentheses: cannot be a reference, so the tokenizer must
    // not attempt to match it either.
    expect(roundTrips("[the protocol](https://example.org/protocol)")).toBe(
      true,
    );
  });

  it("leaves an art: title holding an invalid ULID (wrong length, or excluded letters I/L/O/U) as an ordinary link", () => {
    const doc = parseSectionMarkdown(
      '[Bad ref](evidence/x.pdf "art:not-a-real-ulid")',
    );
    const textNode = doc.content?.[0]?.content?.[0];
    expect(textNode?.type).toBe("text");
    expect(textNode?.marks?.[0]?.type).toBe("link");
    expect(textNode?.marks?.[0]?.attrs?.title).toBe("art:not-a-real-ulid");
  });

  it("round-trips a reference inline with surrounding prose", () => {
    expect(
      roundTrips(
        `See [PCA by treatment](evidence/pca_by_treatment.v2.pdf "art:${COPY_ULID} v2") for details.`,
      ),
    ).toBe(true);
  });
});

describe("buildArtefactRefNode", () => {
  it("builds the JSON node for a pinned reference (FR-EDT-05)", () => {
    expect(
      buildArtefactRefNode({
        ulid: COPY_ULID,
        version: 3,
        label: "PCA by treatment",
        target: "evidence/pca_by_treatment.v3.pdf",
      }),
    ).toEqual({
      type: ARTEFACT_REF_NODE_NAME,
      attrs: {
        ulid: COPY_ULID,
        version: 3,
        label: "PCA by treatment",
        target: "evidence/pca_by_treatment.v3.pdf",
      },
    });
  });
});
