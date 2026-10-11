import type { JSONContent } from "@tiptap/core";
import { parseSectionMarkdown } from "../editor";
import {
  citationsIn,
  unresolvedMarker,
  type CitationCursor,
} from "./exportCitations";

/**
 * Text inside a block, as the PDF template reads it (ADR-0056). The template
 * is fixed and knows exactly these shapes; anything the editor keeps that is
 * not one of them is carried as the text written, never as structure.
 */
export type PdfInline =
  | { t: "text"; s: string }
  | { t: "em"; c: PdfInline[] }
  | { t: "strong"; c: PdfInline[] }
  | { t: "code"; s: string }
  | { t: "cite"; s: string }
  | { t: "br" }
  | { t: "link"; href: string; c: PdfInline[] };

export type PdfBlock =
  | { t: "p"; c: PdfInline[] }
  | { t: "h"; level: number; c: PdfInline[] }
  | { t: "ul"; items: PdfBlock[][] }
  | { t: "ol"; start: number; items: PdfBlock[][] }
  | { t: "code"; text: string }
  | { t: "quote"; c: PdfBlock[] }
  | { t: "raw"; text: string };

const SAFE_LINK = /^(?:https?:|mailto:)/iu;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? Object.entries(value).find(([name]) => name === key)?.[1]
    : undefined;
}

function plain(node: JSONContent): string {
  return (
    text(node.text) + (node.content ?? []).map((child) => plain(child)).join("")
  );
}

function marked(node: JSONContent): PdfInline {
  let run: PdfInline = { t: "text", s: text(node.text) };
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        run = { t: "strong", c: [run] };
        break;
      case "italic":
        run = { t: "em", c: [run] };
        break;
      case "code":
        run = { t: "code", s: text(node.text) };
        break;
      case "link": {
        const href = text(mark.attrs?.href).trim();
        // Anything but a web or mail address, such as `javascript:` or `file:`, stays text.
        if (SAFE_LINK.test(href)) run = { t: "link", href, c: [run] };
        break;
      }
      default:
        break;
    }
  }
  return run;
}

function citation(node: JSONContent): string {
  const items: unknown[] = Array.isArray(node.attrs?.items)
    ? node.attrs.items
    : [];
  const parts = items.map((item) => {
    const suffix = text(field(item, "suffix"));
    const dash = field(item, "suppressAuthor") === true ? "-" : "";
    const tail = suffix === "" ? "" : `, ${suffix}`;
    return `${text(field(item, "prefix"))}${dash}@${text(field(item, "citekey"))}${tail}`;
  });
  return `[${parts.join("; ")}]`;
}

function citekeysOf(node: JSONContent): string[] {
  if (node.type === "citationInText") return [text(node.attrs?.citekey)];
  const items: unknown[] = Array.isArray(node.attrs?.items)
    ? node.attrs.items
    : [];
  return items.map((item) => text(field(item, "citekey")));
}

/** The resolved text of a citation, a marker when it has none, or the source text without a cursor. */
function resolved(
  node: JSONContent,
  source: PdfInline,
  cursor: CitationCursor | undefined,
): PdfInline {
  if (cursor === undefined) return source;
  const done = cursor.next();
  return done === null
    ? { t: "cite", s: unresolvedMarker(citekeysOf(node)) }
    : { t: "text", s: done };
}

function inlineOf(node: JSONContent, cursor?: CitationCursor): PdfInline[] {
  switch (node.type ?? "") {
    case "text":
      return [marked(node)];
    case "hardBreak":
      return [{ t: "br" }];
    case "citation":
      return [resolved(node, { t: "cite", s: citation(node) }, cursor)];
    case "citationInText": {
      const locator = text(node.attrs?.locator);
      const tail = locator === "" ? "" : ` [${locator}]`;
      return [
        resolved(
          node,
          { t: "cite", s: `@${text(node.attrs?.citekey)}${tail}` },
          cursor,
        ),
      ];
    }
    case "artefactRef":
      // A PDF has nothing to link a captured file to, so the label stands alone.
      return [{ t: "text", s: text(node.attrs?.label) }];
    default:
      return (node.content ?? []).flatMap((child) => inlineOf(child, cursor));
  }
}

function itemsOf(node: JSONContent, cursor?: CitationCursor): PdfBlock[][] {
  return (node.content ?? []).map((item) => blocksOf(item, cursor));
}

function blockOf(node: JSONContent, cursor?: CitationCursor): PdfBlock[] {
  switch (node.type ?? "") {
    case "orderedList": {
      const start: unknown = node.attrs?.start;
      return [
        {
          t: "ol",
          start: typeof start === "number" ? start : 1,
          items: itemsOf(node, cursor),
        },
      ];
    }
    case "bulletList":
      return [{ t: "ul", items: itemsOf(node, cursor) }];
    case "heading":
      // Page headings own levels 1 and 2, so a section's own levels 3 and 4 sit below them.
      return [
        {
          t: "h",
          level: node.attrs?.level === 3 ? 3 : 4,
          c: (node.content ?? []).flatMap((child) => inlineOf(child, cursor)),
        },
      ];
    case "codeBlock":
      return [{ t: "code", text: plain(node) }];
    case "passthrough":
      // Raw HTML, tables and other constructs are shown as the text written, never run.
      // Its citations are not resolved, but they still count in the engine's order.
      cursor?.skip(citationsIn(text(node.attrs?.markdown)));
      return [{ t: "raw", text: text(node.attrs?.markdown).trim() }];
    case "paragraph":
      return [
        {
          t: "p",
          c: (node.content ?? []).flatMap((child) => inlineOf(child, cursor)),
        },
      ];
    case "blockquote":
      return [{ t: "quote", c: blocksOf(node, cursor) }];
    default:
      return blocksOf(node, cursor);
  }
}

function blocksOf(node: JSONContent, cursor?: CitationCursor): PdfBlock[] {
  return (node.content ?? []).flatMap((child) => blockOf(child, cursor));
}

/**
 * One stored Markdown text (a Motivation or a section) as blocks for the PDF
 * template (FR-ARC-06). It goes through the editor's own parser, so the PDF,
 * the HTML export and the application agree on what the text means
 * (AGENTS.md 2.2). Nothing is passed on as markup: the template receives data.
 * With a `cursor`, each citation becomes its formatted text (issue #102);
 * without one it is carried as written.
 */
export function pdfBlocks(
  markdown: string,
  cursor?: CitationCursor,
): PdfBlock[] {
  if (markdown.trim() === "") return [];
  return blocksOf(parseSectionMarkdown(markdown), cursor);
}

/**
 * One line of formatted text, such as a bibliography entry. A leading number
 * such as `1.` is kept as text instead of starting a list.
 */
export function pdfInline(markdown: string): PdfInline[] {
  const escaped = markdown.replace(/^(\d+)\.(\s)/u, "$1\\.$2");
  const fallback: PdfInline[] = [{ t: "text", s: markdown }];
  return pdfBlocks(escaped).flatMap((block) =>
    block.t === "p" ? block.c : fallback,
  );
}
