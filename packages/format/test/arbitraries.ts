import type { JSONContent } from "@tiptap/core";
import fc from "fast-check";

/**
 * fast-check generators for S1-T02: documents covering every node
 * currently supported by the S1-T01 Tiptap spike (paragraph, text,
 * artefactRef, citation). Per the task's agent note these are the
 * permanent generators for packages/format's round-trip property tests,
 * carried into Stage 2.
 *
 * Text is drawn from a deliberately narrow safe character set. It
 * excludes characters that MarkdownManager already escapes for arbitrary
 * text (*, _, `, ~, [, ], \), plus two characters that create genuine
 * Markdown round-trip ambiguities discovered while validating this
 * harness against the S1-T01 spike:
 *   - "!" immediately before an artefactRef node forms an image
 *     (`![label](url)`), silently dropping the node.
 *   - A paragraph starting with "-", "*", "+", "#", ">", "`", "~" or a
 *     digit collides with block-level Markdown (lists, headings,
 *     blockquotes, thematic breaks, code fences).
 * Both are addressed below (see ensureSafeParagraphStart) rather than
 * fixed in the parser, since that is Stage 2 work.
 */

const SAFE_TEXT_CHARS = [
  ..."abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,-'?",
];

function safeText(minLength: number, maxLength: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...SAFE_TEXT_CHARS), { minLength, maxLength })
    .map((chars) => chars.join(""))
    .filter((text) => text.trim().length > 0);
}

const ULID_CHARS = [..."0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

/** Spec 5.2: ULID is 26 characters, Crockford Base32, uppercase. */
export function ulid(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...ULID_CHARS), { minLength: 26, maxLength: 26 })
    .map((chars) => chars.join(""));
}

const ITEM_KEY_CHARS = [..."23456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"];

function itemKey(): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...ITEM_KEY_CHARS), { minLength: 8, maxLength: 8 })
    .map((chars) => chars.join(""));
}

/** Spec 5.7: citekey = "z:" library ":" item-key. */
export function citekey(): fc.Arbitrary<string> {
  return fc.oneof(
    itemKey().map((key) => `z:u:${key}`),
    fc
      .tuple(fc.integer({ min: 0, max: 9999 }), itemKey())
      .map(([groupId, key]) => `z:g${groupId}:${key}`),
  );
}

/** A plain text inline node, drawn from the safe character set. */
export function textNode(): fc.Arbitrary<JSONContent> {
  return safeText(1, 20).map((text) => ({ type: "text", text }));
}

/** Spec 5.6: an artefactRef node, in copy mode (versioned) or link mode. */
export function artefactRefNode(): fc.Arbitrary<JSONContent> {
  return fc
    .record({
      ulid: ulid(),
      version: fc.option(fc.integer({ min: 1, max: 99 }), { nil: null }),
      label: safeText(1, 15),
      target: fc
        .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_./-"), {
          minLength: 1,
          maxLength: 20,
        })
        .map((chars) => chars.join("")),
    })
    .map((attrs) => ({ type: "artefactRef", attrs }));
}

function citationItem(): fc.Arbitrary<{
  prefix: string;
  suppressAuthor: boolean;
  citekey: string;
  suffix: string;
}> {
  return fc.record({
    prefix: fc.constant(""),
    suppressAuthor: fc.boolean(),
    citekey: citekey(),
    suffix: fc.constant(""),
  });
}

/** Spec 5.7: a citation node with one or more citekeys. */
export function citationNode(): fc.Arbitrary<JSONContent> {
  return fc
    .array(citationItem(), { minLength: 1, maxLength: 3 })
    .map((items) => ({ type: "citation", attrs: { items } }));
}

/**
 * Merges adjacent text nodes, matching how MarkdownManager's own parser
 * normalises consecutive text tokens. Without this, a generated document
 * with two adjacent text nodes would never deep-equal what parsing its
 * serialised form produces.
 */
function mergeAdjacentText(nodes: JSONContent[]): JSONContent[] {
  const result: JSONContent[] = [];
  for (const node of nodes) {
    const previous = result.at(-1);
    if (node.type === "text" && previous?.type === "text") {
      previous.text = (previous.text ?? "") + (node.text ?? "");
    } else {
      result.push({ ...node });
    }
  }
  return result;
}

const BLOCK_MARKER_START = /^\s*([-*+#>`~]|\d)/;

/**
 * Prefixes a safe letter when a paragraph's first text node would
 * otherwise start with a Markdown block marker (see module doc comment).
 */
function ensureSafeParagraphStart(nodes: JSONContent[]): JSONContent[] {
  const [first, ...rest] = nodes;
  if (first?.type === "text" && BLOCK_MARKER_START.test(first.text ?? "")) {
    return [{ ...first, text: `x${first.text ?? ""}` }, ...rest];
  }
  return nodes;
}

/** A paragraph containing a mix of text, artefactRef and citation nodes. */
export function paragraphNode(): fc.Arbitrary<JSONContent> {
  return fc
    .array(fc.oneof(textNode(), artefactRefNode(), citationNode()), {
      minLength: 1,
      maxLength: 5,
    })
    .map((content) => ({
      type: "paragraph",
      content: ensureSafeParagraphStart(mergeAdjacentText(content)),
    }));
}

/** A document containing one or more paragraphs. */
export function document(): fc.Arbitrary<JSONContent> {
  return fc
    .array(paragraphNode(), { minLength: 1, maxLength: 4 })
    .map((content) => ({ type: "doc", content }));
}
