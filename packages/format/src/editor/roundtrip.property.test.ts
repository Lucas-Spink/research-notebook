import type { JSONContent } from "@tiptap/core";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { buildArtefactRefNode } from "./artefactRef";
import { parseSectionMarkdown, serialiseSectionMarkdown } from "./markdown";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

/**
 * fast-check generators for the FR-EDT-01 section-editor schema: plain text,
 * a single mark at a time (bold, italic or inline code — combining/nesting
 * marks is not covered here), links, artefact references (spec 5.6,
 * FR-EDT-04, S4-G04), headings restricted to levels 3 and 4, bulleted and
 * numbered lists of plain-text items, block quotes and code blocks.
 * Excludes characters MarkdownManager escapes (*, _, `, ~, [, ], \) and
 * Markdown block markers at a paragraph's start, the same constraints
 * `test/arbitraries.ts` already documents for the notebook-level parser.
 */

const SAFE_TEXT_CHARS = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,'?",
];

/**
 * Text without leading or trailing whitespace: the serializer trims
 * whitespace at mark boundaries (`renderNodesWithMarkBoundaries`), so text
 * generated with significant edge whitespace would not round-trip through
 * a real editor's document model either.
 */
function safeText(minLength: number, maxLength: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...SAFE_TEXT_CHARS), { minLength, maxLength })
    .map((chars) => chars.join(""))
    .filter(
      (text) =>
        text.trim().length > 0 &&
        text === text.trim() &&
        !/^\s*\d+$/.test(text),
    );
}

function sameMarks(a: JSONContent["marks"], b: JSONContent["marks"]): boolean {
  const aType = a?.[0]?.type ?? null;
  const bType = b?.[0]?.type ?? null;
  return aType === bType;
}

/**
 * Merges adjacent text nodes carrying the same mark, matching how
 * MarkdownManager's own parser normalises consecutive text tokens
 * (`parseInlineTokens`'s `marksEqual` merge). Without this, two generated
 * text nodes with the same mark would never deep-equal what parsing their
 * serialised form produces.
 */
function mergeAdjacentSameMarkText(nodes: JSONContent[]): JSONContent[] {
  const result: JSONContent[] = [];
  for (const node of nodes) {
    const previous = result.at(-1);
    if (
      node.type === "text" &&
      previous?.type === "text" &&
      sameMarks(node.marks, previous.marks)
    ) {
      previous.text = (previous.text ?? "") + (node.text ?? "");
    } else {
      result.push({ ...node });
    }
  }
  return result;
}

// A leading digit could be read as an ordered-list marker ("1. "); one or
// more letters followed by "." or ")" and a space is also a marker this
// editor's ordered-list extension recognises (alphabetic lists, e.g.
// "a. " or "aV. ") — observed to silently drop the letters and fall back
// to a plain "1." when the letter run is more than one character. The
// prefix below must put a space before the risky text, not just a
// character glued onto it: gluing "x" onto "A. " gives "xA. ", itself two
// letters before the period, i.e. the same ambiguity again.
const BLOCK_MARKER_START = /^\s*(\d|[a-zA-Z]+[.)]\s)/;

function safeParagraphStart(text: string): string {
  return BLOCK_MARKER_START.test(text) ? `x ${text}` : text;
}

function markedText(): fc.Arbitrary<JSONContent> {
  return fc
    .tuple(
      safeText(1, 15),
      fc.constantFrom<null | "bold" | "italic" | "code">(
        null,
        "bold",
        "italic",
        "code",
      ),
    )
    .map(([text, mark]) => ({
      type: "text",
      text,
      ...(mark === null ? {} : { marks: [{ type: mark }] }),
    }));
}

/**
 * Separates adjacent nodes with different marks by inserting a new, plain
 * (unmarked) single-space text node between them. Without this, a mark's
 * delimiter can land next to plain punctuation with no whitespace
 * (`a*,a*`), which CommonMark's emphasis flanking rules do not always parse
 * back the same way — a real editor never produces that shape either, since
 * marks are toggled between words, not mid-word. The space is its own node
 * (not prepended into a marked node's text) because the serializer already
 * extracts leading whitespace out from inside a mark's delimiters, which
 * would otherwise make the generated document not match what re-parsing it
 * produces.
 */
function spaceDifferentMarks(nodes: JSONContent[]): JSONContent[] {
  return nodes.flatMap((node, index) => {
    const previous = nodes[index - 1];
    if (
      index === 0 ||
      previous === undefined ||
      sameMarks(node.marks, previous.marks)
    ) {
      return [node];
    }
    return [{ type: "text", text: " " }, node];
  });
}

function paragraphContent(): fc.Arbitrary<JSONContent[]> {
  return fc.array(markedText(), { minLength: 1, maxLength: 4 }).map((raw) => {
    // Spacing can put two freshly-unmarked nodes next to each other (the
    // separator and an originally unmarked neighbour), so merge again
    // after spacing, not just before it.
    const nodes = mergeAdjacentSameMarkText(
      spaceDifferentMarks(mergeAdjacentSameMarkText(raw)),
    );
    const [first, ...rest] = nodes;
    if (first === undefined) return nodes;
    return [{ ...first, text: safeParagraphStart(first.text ?? "") }, ...rest];
  });
}

function paragraphNode(): fc.Arbitrary<JSONContent> {
  return paragraphContent().map((content) => ({ type: "paragraph", content }));
}

function headingNode(): fc.Arbitrary<JSONContent> {
  return fc
    .tuple(fc.constantFrom(3, 4), paragraphContent())
    .map(([level, content]) => ({
      type: "heading",
      attrs: { level },
      content,
    }));
}

function linkNode(): fc.Arbitrary<JSONContent> {
  return fc
    .tuple(
      safeText(1, 10),
      fc
        .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789/-."), {
          minLength: 1,
          maxLength: 15,
        })
        .map((chars) => `https://example.org/${chars.join("")}`),
    )
    .map(([text, href]) => ({
      type: "paragraph",
      content: [
        {
          type: "text",
          text: safeParagraphStart(text),
          marks: [{ type: "link", attrs: { href, title: null } }],
        },
      ],
    }));
}

// Crockford Base32, excluding I, L, O, U (matches schema/common.ts's Ulid).
const ULID_CHARS = [..."0123456789ABCDEFGHJKMNPQRSTVWXYZ"];

function ulid(): fc.Arbitrary<string> {
  return fc
    .tuple(
      fc.constantFrom(..."01234567"),
      fc.array(fc.constantFrom(...ULID_CHARS), {
        minLength: 25,
        maxLength: 25,
      }),
    )
    .map(([first, rest]) => first + rest.join(""));
}

// No whitespace or ")" (spec 5.6's target = "[^\s)]+"); no "]" (the label's
// own delimiter) either, though nothing here would put one in a target.
function artefactRefTarget(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789/_.-"), {
      minLength: 1,
      maxLength: 20,
    })
    .map((chars) => `evidence/${chars.join("")}`);
}

function artefactRefNode(): fc.Arbitrary<JSONContent> {
  return fc
    .tuple(
      ulid(),
      fc.option(fc.integer({ min: 1, max: 99 }), { nil: null }),
      safeText(1, 12),
      artefactRefTarget(),
    )
    .map(([id, version, label, target]) => ({
      type: "paragraph",
      content: [buildArtefactRefNode({ ulid: id, version, label, target })],
    }));
}

function blockquoteNode(): fc.Arbitrary<JSONContent> {
  return paragraphNode().map((paragraph) => ({
    type: "blockquote",
    content: [paragraph],
  }));
}

function codeBlockNode(): fc.Arbitrary<JSONContent> {
  return safeText(1, 20).map((text) => ({
    type: "codeBlock",
    attrs: { language: null },
    content: [{ type: "text", text }],
  }));
}

function listNode(): fc.Arbitrary<JSONContent> {
  return fc
    .tuple(
      fc.constantFrom<"bulletList" | "orderedList">(
        "bulletList",
        "orderedList",
      ),
      fc.array(paragraphNode(), { minLength: 1, maxLength: 4 }),
    )
    .map(([type, items]) => ({
      type,
      content: items.map((paragraph) => ({
        type: "listItem",
        content: [paragraph],
      })),
    }));
}

function blockNode(): fc.Arbitrary<JSONContent> {
  return fc.oneof(
    paragraphNode(),
    headingNode(),
    linkNode(),
    artefactRefNode(),
    blockquoteNode(),
    codeBlockNode(),
    listNode(),
  );
}

/**
 * CommonMark has no way to write two adjacent bulleted (or two adjacent
 * numbered) lists as distinct blocks using the same marker: separated by
 * one blank line they parse back as one loose list with more items, and
 * that is the correct reading. Adjacent same-type lists are merged here so
 * the generated document matches what parsing its own serialised form
 * produces.
 */
function mergeAdjacentSameTypeLists(nodes: JSONContent[]): JSONContent[] {
  const result: JSONContent[] = [];
  for (const node of nodes) {
    const previous = result.at(-1);
    if (
      (node.type === "bulletList" || node.type === "orderedList") &&
      previous?.type === node.type
    ) {
      previous.content = [...(previous.content ?? []), ...(node.content ?? [])];
    } else {
      result.push({ ...node });
    }
  }
  return result;
}

function sectionDocument(): fc.Arbitrary<JSONContent> {
  return fc
    .array(blockNode(), { minLength: 1, maxLength: 5 })
    .map((content) => ({
      type: "doc",
      content: mergeAdjacentSameTypeLists(content),
    }));
}

describe("section editor round-trip (FR-EDT-01)", () => {
  it("parse(serialise(doc)) deep-equals doc", () => {
    fc.assert(
      fc.property(sectionDocument(), (doc) => {
        const text = serialiseSectionMarkdown(doc);
        expect(parseSectionMarkdown(text)).toEqual(doc);
      }),
      { numRuns },
    );
  });

  it("serialise is canonical: serialise(parse(text)) equals text", () => {
    fc.assert(
      fc.property(sectionDocument(), (doc) => {
        const text = serialiseSectionMarkdown(doc);
        const again = parseSectionMarkdown(text);
        expect(serialiseSectionMarkdown(again)).toBe(text);
      }),
      { numRuns },
    );
  });
});
