import type { JSONContent, MarkdownToken } from "@tiptap/core";
import { MarkdownManager } from "@tiptap/markdown";
import { sectionEditorExtensions } from "./extensions";
import { isRepresentable, passthroughNode } from "./passthrough";

const manager = new MarkdownManager({ extensions: sectionEditorExtensions() });

/**
 * One top-level block's Tiptap JSON: `token`'s own subtree if this editor's
 * schema can represent it end to end, otherwise one passthrough node holding
 * `token.raw` verbatim (FR-EDT-02). Representable blocks are parsed by a
 * fresh call into `manager` so ordinary Markdown constructs still go through
 * the real, schema-driven parser (StarterKit's registered node/mark
 * handlers) rather than being reimplemented here.
 */
function parseBlock(token: MarkdownToken): JSONContent[] {
  if (token.type === "space") return [];
  if (!isRepresentable(token)) return [passthroughNode(token)];
  // `token.raw` for a block-level token commonly absorbs the blank line
  // that follows it (marked keeps block boundaries in `raw`). Re-parsing
  // that trailing blank line here, in isolation from the rest of the
  // document, would read as a deliberate empty paragraph rather than mere
  // spacing between blocks, so it is trimmed before this block's own,
  // self-contained content is parsed.
  return manager.parse((token.raw ?? "").trim()).content ?? [];
}

/**
 * Parses one section's stored Markdown text (Methods, Results Notes or
 * Interpretation) into the Tiptap document `apps/desktop`'s editor loads
 * (FR-EDT-01, FR-EDT-02). The split happens per top-level block, before any
 * of it reaches the schema-driven parser, so a table, raw HTML, or a heading
 * outside levels 3–4 anywhere in the text — including nested inside a list
 * or block quote — demotes exactly its own enclosing block to a read-only
 * passthrough node without touching the rest of the document.
 */
export function parseSectionMarkdown(markdown: string): JSONContent {
  const tokens = manager.instance.lexer(markdown);
  const content = tokens.flatMap(parseBlock);
  // A ProseMirror doc needs at least one block; an empty section is an
  // empty paragraph, matching how a freshly created editor starts.
  return {
    type: "doc",
    content:
      content.length > 0 ? content : [{ type: "paragraph", content: [] }],
  };
}

/**
 * Serialises a section's Tiptap document back to Markdown text (FR-EDT-09:
 * this is what `editExperimentSection` then writes to `experiment.md`
 * unchanged, through the existing autosave path).
 */
export function serialiseSectionMarkdown(doc: JSONContent): string {
  return manager.serialize(doc);
}
