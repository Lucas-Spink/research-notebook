import type { JSONContent } from "@tiptap/core";
import { parseSectionMarkdown } from "../editor";
import {
  citationsIn,
  unresolvedMarker,
  type CitationCursor,
} from "./exportCitations";

/**
 * Where an artefact reference leads: a link relative to the exported page, or
 * `null` when the artefact or version is not part of the export, in which case
 * the reference is shown as its label only.
 */
export type RefLinks = (ulid: string, version: number | null) => string | null;

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** Text for use in element content or a quoted attribute. The only way user text reaches the export. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/gu, (char) => ESCAPES[char] ?? char);
}

/** What rendering needs besides the tree: artefact links and, optionally, the citation texts. */
type Ctx = { refs: RefLinks; cursor: CitationCursor | undefined };

const SAFE_LINK = /^(?:https?:|mailto:)/iu;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function field(value: unknown, key: string): unknown {
  return typeof value === "object" && value !== null && key in value
    ? Object.entries(value).find(([name]) => name === key)?.[1]
    : undefined;
}

function marked(node: JSONContent): string {
  let html = escapeHtml(text(node.text));
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        html = `<strong>${html}</strong>`;
        break;
      case "italic":
        html = `<em>${html}</em>`;
        break;
      case "code":
        html = `<code>${html}</code>`;
        break;
      case "link": {
        const href = text(mark.attrs?.href).trim();
        // Anything but a web or mail address, such as `javascript:` or `file:`, stays text.
        if (SAFE_LINK.test(href)) {
          html = `<a href="${escapeHtml(href)}">${html}</a>`;
        }
        break;
      }
      default:
        break;
    }
  }
  return html;
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
  return `<cite>[${escapeHtml(parts.join("; "))}]</cite>`;
}

function citekeysOf(node: JSONContent): string[] {
  if (node.type === "citationInText") return [text(node.attrs?.citekey)];
  const items: unknown[] = Array.isArray(node.attrs?.items)
    ? node.attrs.items
    : [];
  return items.map((item) => text(field(item, "citekey")));
}

/** A citation's resolved text, a marker when it has none, or `written` (the source form) without a cursor. */
function resolved(node: JSONContent, written: string, ctx: Ctx): string {
  if (ctx.cursor === undefined) return written;
  const done = ctx.cursor.next();
  const shown = done ?? unresolvedMarker(citekeysOf(node));
  return `<cite>${escapeHtml(shown)}</cite>`;
}

function inline(node: JSONContent, ctx: Ctx): string {
  switch (node.type ?? "") {
    case "text":
      return marked(node);
    case "hardBreak":
      return "<br>";
    case "citation":
      return resolved(node, citation(node), ctx);
    case "citationInText": {
      const locator = text(node.attrs?.locator);
      const tail = locator === "" ? "" : ` [${locator}]`;
      const written = `<cite>${escapeHtml(`@${text(node.attrs?.citekey)}${tail}`)}</cite>`;
      return resolved(node, written, ctx);
    }
    case "artefactRef": {
      const label = escapeHtml(text(node.attrs?.label));
      const raw: unknown = node.attrs?.version;
      const version = typeof raw === "number" ? raw : null;
      const href = ctx.refs(text(node.attrs?.ulid), version);
      return href === null
        ? label
        : `<a href="${escapeHtml(href)}">${label}</a>`;
    }
    default:
      return children(node, ctx);
  }
}

function children(node: JSONContent, ctx: Ctx): string {
  return (node.content ?? []).map((child) => block(child, ctx)).join("");
}

function block(node: JSONContent, ctx: Ctx): string {
  switch (node.type ?? "") {
    case "orderedList": {
      const start: unknown = node.attrs?.start;
      const attr =
        typeof start === "number" && start !== 1 ? ` start="${start}"` : "";
      return `<ol${attr}>${children(node, ctx)}</ol>`;
    }
    case "heading": {
      // Page headings own levels 1 to 3, so a section's own levels 3 and 4 sit below them.
      const level = node.attrs?.level === 3 ? 4 : 5;
      return `<h${level}>${children(node, ctx)}</h${level}>`;
    }
    case "codeBlock":
      return `<pre><code>${escapeHtml(plain(node))}</code></pre>`;
    case "passthrough":
      // Raw HTML, tables and other constructs are shown as the text written, never run.
      // Their citations are not resolved but still count in the engine's order.
      ctx.cursor?.skip(citationsIn(text(node.attrs?.markdown)));
      return `<pre class="raw">${escapeHtml(text(node.attrs?.markdown).trim())}</pre>`;
    case "paragraph":
      return `<p>${children(node, ctx)}</p>`;
    case "blockquote":
      return `<blockquote>${children(node, ctx)}</blockquote>`;
    case "bulletList":
      return `<ul>${children(node, ctx)}</ul>`;
    case "listItem":
      return `<li>${children(node, ctx)}</li>`;
    default:
      return inline(node, ctx);
  }
}

function plain(node: JSONContent): string {
  return (
    text(node.text) + (node.content ?? []).map((child) => plain(child)).join("")
  );
}

/**
 * Renders one stored Markdown text (a Motivation or a section) as HTML for the
 * static export (FR-ARC-05). It goes through the editor's own parser, so the
 * export and the application agree on what the text means (AGENTS.md 2.2).
 * Output is built from the parsed tree and escaped; raw HTML in the text is
 * never passed through, and only web and mail links become links. With a
 * `cursor`, each citation becomes its formatted text (issue #102); without
 * one it is shown as written.
 */
export function renderMarkdownHtml(
  markdown: string,
  refs: RefLinks,
  cursor?: CitationCursor,
): string {
  if (markdown.trim() === "") return "";
  return children(parseSectionMarkdown(markdown), { refs, cursor });
}
