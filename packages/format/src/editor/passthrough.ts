import type { JSONContent, MarkdownToken } from "@tiptap/core";
import { Node } from "@tiptap/core";

/**
 * Node name for a block this editor cannot represent structurally: kept
 * read-only and byte-identical to what was on disk (FR-EDT-02).
 */
export const PASSTHROUGH_NODE_NAME = "passthrough";

/**
 * The schema node: an atomic, non-editable block holding one construct's raw
 * Markdown verbatim. `apps/desktop` attaches its own read-only NodeView;
 * `renderHTML`/`parseHTML` here are only the headless fallback (packages/format
 * does no I/O and imports no UI framework, AGENTS.md 4).
 */
export const Passthrough = Node.create({
  name: PASSTHROUGH_NODE_NAME,
  group: "block",
  atom: true,
  selectable: true,
  addAttributes: () => ({ markdown: { default: "" } }),
  parseHTML: () => [{ tag: "pre[data-passthrough]" }],
  renderHTML: ({ node }) => [
    "pre",
    { "data-passthrough": "" },
    typeof node.attrs.markdown === "string" ? node.attrs.markdown : "",
  ],
  renderMarkdown: (node: JSONContent) =>
    typeof node.attrs?.markdown === "string" ? node.attrs.markdown : "",
});

/** Builds a passthrough node holding `token`'s raw Markdown verbatim. */
export function passthroughNode(token: MarkdownToken): JSONContent {
  return { type: PASSTHROUGH_NODE_NAME, attrs: { markdown: token.raw ?? "" } };
}

/**
 * Token type names this editor can represent as real, editable nodes or
 * marks (FR-EDT-01: paragraphs, bold, italic, inline code, bulleted and
 * numbered lists, links, block quotes, code blocks; headings are checked
 * separately below).
 */
const REPRESENTABLE_TYPES: ReadonlySet<string> = new Set([
  "paragraph",
  "blockquote",
  "list",
  "list_item",
  "code",
  "text",
  "escape",
  "strong",
  "em",
  "codespan",
  "link",
  "space",
  // An artefact reference (spec 5.6, FR-EDT-04): a link whose title starts
  // "art:" and holds a valid ULID tokenizes as this instead of "link" (see
  // ./artefactRef.ts); anything else with an art:-prefixed title stays a
  // plain "link", already representable above.
  "artefactRef",
]);

/**
 * Whether `token`, and everything nested inside it, is something this
 * editor's schema can represent. Recurses through both block children
 * (`tokens`) and list items (`items`) so a table, raw HTML, an image or a
 * heading of the wrong level buried inside a blockquote or list demotes the
 * whole enclosing construct to passthrough, rather than losing or
 * reinterpreting only part of it (FR-EDT-02).
 *
 * A heading needs `depth` 3 or 4 (FR-EDT-01); level 2 cannot occur here —
 * format-v1.md 4.3 reserves it for section headings, split out by
 * `parseExperimentBody` before this parser ever sees the section text.
 */
export function isRepresentable(token: MarkdownToken): boolean {
  const type = token.type;
  if (type === undefined) return false;
  if (type === "heading") return token.depth === 3 || token.depth === 4;
  if (!REPRESENTABLE_TYPES.has(type)) return false;
  const children = token.tokens ?? [];
  const items = token.items ?? [];
  return [...children, ...items].every(isRepresentable);
}
