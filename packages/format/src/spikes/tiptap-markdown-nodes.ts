import type {
  Attributes,
  JSONContent,
  MarkdownRendererHelpers,
} from "@tiptap/core";
import { Node } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";

/**
 * Spike for S1-T01: proves `@tiptap/markdown`'s MarkdownManager can parse
 * and serialise the artefactRef (spec 5.6) and citation (spec 5.7) syntax
 * as custom Tiptap nodes, entirely outside an Editor/DOM instance. This is
 * spike evidence, not the production parser — that is built in
 * packages/format under S2-T01/S2-T02 once the format document and schema
 * are approved (both protected paths).
 *
 * Document, Paragraph and Text below are the minimal container nodes
 * needed to hold artefactRef/citation inside prose; they are not a stand-in
 * for the real editor schema built in Stage 4.
 */

const Document = Node.create({
  name: "doc",
  topNode: true,
  content: "block+",
  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) =>
    helpers.renderChildren(node.content ?? [], "\n\n"),
});

const Paragraph = Node.create({
  name: "paragraph",
  group: "block",
  content: "inline*",
  // No parseMarkdown/markdownTokenName: MarkdownManager's built-in fallback
  // already turns marked's 'paragraph' token into this exact shape. Only
  // rendering needs a registered handler (there is no render fallback).
  renderMarkdown: (node: JSONContent, helpers: MarkdownRendererHelpers) =>
    helpers.renderChildren(node.content ?? []),
});

// Text nodes are special-cased by name ("text") in both marked and
// MarkdownManager, so this needs no markdown parse/render config.
const Text = Node.create({ name: "text", group: "inline" });

/**
 * MarkdownToken fields come through the library typed as `any`. These
 * guards validate our own tokenizers' output at the point it re-enters
 * typed code, rather than casting past the check.
 */
function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`expected token.${field} to be a string`);
  }
  return value;
}

// Spec 5.2: ULID is 26 characters of Crockford Base32, uppercase. This
// spike accepts the full [0-9A-Z] range rather than excluding I, L, O, U;
// the real implementation should use a shared ULID validator.
const ULID_PATTERN = "[0-9A-Z]{26}";
const ARTEFACT_REF_ANCHORED = new RegExp(
  `^\\[([^\\]]*)\\]\\(([^\\s)]+)\\s+"art:(${ULID_PATTERN})(?: v(\\d+))?"\\)`,
);
const ARTEFACT_REF_SEARCH = new RegExp(
  `\\[[^\\]]*\\]\\([^\\s)]+\\s+"art:${ULID_PATTERN}(?: v\\d+)?"\\)`,
);

const artefactRefAttributes: Attributes = {
  ulid: { default: null },
  version: { default: null },
  label: { default: "" },
  target: { default: "" },
};

const ArtefactRef = Node.create({
  name: "artefactRef",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => artefactRefAttributes,
  markdownTokenName: "artefactRef",
  markdownTokenizer: {
    name: "artefactRef",
    level: "inline",
    start(src: string) {
      const match = ARTEFACT_REF_SEARCH.exec(src);
      return match ? match.index : -1;
    },
    tokenize(src: string) {
      const match = ARTEFACT_REF_ANCHORED.exec(src);
      if (!match) return undefined;
      const [raw, label, target, ulid, version] = match;
      return { type: "artefactRef", raw, label, target, ulid, version };
    },
  },
  parseMarkdown: (token) => ({
    type: "artefactRef",
    attrs: {
      ulid: expectString(token.ulid, "ulid"),
      version: token.version
        ? Number(expectString(token.version, "version"))
        : null,
      label: expectString(token.label, "label"),
      target: expectString(token.target, "target"),
    },
  }),
  renderMarkdown: (node: JSONContent) => {
    const attrs = node.attrs ?? {};
    const label = expectString(attrs.label, "label");
    const target = expectString(attrs.target, "target");
    const ulid = expectString(attrs.ulid, "ulid");
    const versionPart =
      attrs.version != null ? ` v${String(attrs.version)}` : "";
    return `[${label}](${target} "art:${ulid}${versionPart}")`;
  },
});

// Spec 5.7: citekey = "z:" library ":" item-key; library = "u" / ("g" 1*DIGIT);
// item-key = 8 chars from '2'-'9' and 'A'-'Z'.
const CITEKEY_PATTERN = "z:(?:u|g\\d+):[2-9A-Z]{8}";
const CITATION_SEARCH = new RegExp(`\\[[^\\]]*@${CITEKEY_PATTERN}[^\\]]*\\]`);
const CITATION_ANCHORED = new RegExp(
  `^\\[([^\\]]*@${CITEKEY_PATTERN}[^\\]]*)\\]`,
);
// Splits a single citation item into its prefix, optional suppress-author
// "-", citekey and optional locator suffix (everything after the first
// comma). The lazy prefix group backtracks until it finds "-?@<citekey>".
const CITATION_ITEM = new RegExp(
  `^(.*?)(-)?@(${CITEKEY_PATTERN})(?:,\\s*(.*))?$`,
);

interface CitationItem {
  prefix: string;
  suppressAuthor: boolean;
  citekey: string;
  suffix: string;
}

const citationAttributes: Attributes = {
  items: { default: [] },
};

function isCitationItem(value: unknown): value is CitationItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "prefix" in value &&
    typeof value.prefix === "string" &&
    "suppressAuthor" in value &&
    typeof value.suppressAuthor === "boolean" &&
    "citekey" in value &&
    typeof value.citekey === "string" &&
    "suffix" in value &&
    typeof value.suffix === "string"
  );
}

function expectCitationItems(value: unknown): CitationItem[] {
  if (!Array.isArray(value) || !value.every(isCitationItem)) {
    throw new Error(
      "expected token.citationItems to be an array of citation items",
    );
  }
  return value;
}

function parseCitationBody(body: string): CitationItem[] {
  return body.split(";").map((part) => {
    const match = CITATION_ITEM.exec(part.trim());
    if (!match) {
      throw new Error(`invalid citation item: "${part}"`);
    }
    const [, prefix, suppress, citekey, suffix] = match;
    return {
      prefix: prefix ?? "",
      suppressAuthor: suppress === "-",
      citekey: citekey ?? "",
      suffix: suffix ?? "",
    };
  });
}

const Citation = Node.create({
  name: "citation",
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => citationAttributes,
  markdownTokenName: "citation",
  markdownTokenizer: {
    name: "citation",
    level: "inline",
    start(src: string) {
      const match = CITATION_SEARCH.exec(src);
      return match ? match.index : -1;
    },
    tokenize(src: string) {
      const match = CITATION_ANCHORED.exec(src);
      if (!match) return undefined;
      const [raw, body] = match;
      return {
        type: "citation",
        raw,
        citationItems: parseCitationBody(body ?? ""),
      };
    },
  },
  parseMarkdown: (token) => ({
    type: "citation",
    attrs: {
      items: expectCitationItems(token.citationItems),
    },
  }),
  renderMarkdown: (node: JSONContent) => {
    const items = expectCitationItems(node.attrs?.items);
    const body = items
      .map((item) => {
        const suffixPart = item.suffix ? `, ${item.suffix}` : "";
        return `${item.prefix}${item.suppressAuthor ? "-" : ""}@${item.citekey}${suffixPart}`;
      })
      .join("; ");
    return `[${body}]`;
  },
});

const manager = new MarkdownManager({
  extensions: [Document, Paragraph, Text, ArtefactRef, Citation],
});

/** Parse Markdown text containing artefactRef/citation syntax into Tiptap JSON. */
export function parseDocument(markdown: string): JSONContent {
  return manager.parse(markdown);
}

/** Serialise Tiptap JSON back to Markdown text using the spec 5.6/5.7 syntax. */
export function serialiseDocument(doc: JSONContent): string {
  return manager.serialize(doc);
}
