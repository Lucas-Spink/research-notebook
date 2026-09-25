/**
 * Plain-text summaries of Markdown for the table's cells (FR-TBL-05). This is
 * Markdown parsing, so it lives here and nowhere else (AGENTS.md rule 2). It
 * is deliberately small: it removes markup so a cell reads as text, and never
 * needs to be exact, so an odd construct may show a stray marker but never
 * throws and never takes long.
 */

import {
  ARTEFACT_REF_LINK,
  parseArtefactRefTitle,
} from "../editor/artefactRef";

const DEFAULT_MAX = 240;
/** Summaries are for cells, not documents: longer requests are cut here. */
const MAX_LENGTH = 1000;
/** How much of the text is read: a multiple of what is shown, so stripping markup still leaves enough. */
const WINDOW_FACTOR = 8;

/** Characters a backslash can escape, and inside code they are all literal. */
const ESCAPABLE = "\\`*_{}[]()#+-.!|~<>";
/** Private-use stand-ins for escaped characters, so later steps cannot see them as markup. */
const SENTINEL_BASE = 0xe000;
const SENTINEL_END = SENTINEL_BASE + 0xff;
const SENTINEL = new RegExp(
  `[${String.fromCharCode(SENTINEL_BASE)}-${String.fromCharCode(SENTINEL_END)}]`,
  "g",
);
/** Half a surrogate pair, or text that could be mistaken for a sentinel. */
const UNSAFE = new RegExp(
  `[\\uD800-\\uDBFF](?![\\uDC00-\\uDFFF])|(?<![\\uD800-\\uDBFF])[\\uDC00-\\uDFFF]|${SENTINEL.source}`,
  "g",
);
const REPLACEMENT = String.fromCharCode(0xfffd);

function protect(text: string): string {
  let out = "";
  for (const char of text) {
    const at = ESCAPABLE.indexOf(char);
    out += at === -1 ? char : String.fromCharCode(SENTINEL_BASE + at);
  }
  return out;
}

function restore(text: string): string {
  return text.replace(SENTINEL, (char) => {
    return ESCAPABLE[char.charCodeAt(0) - SENTINEL_BASE] ?? "";
  });
}

/** Drops `<!-- ... -->`, and an unclosed one to the end, without rescanning. */
function withoutComments(text: string): string {
  let out = "";
  let from = 0;
  for (;;) {
    const start = text.indexOf("<!--", from);
    if (start === -1) return out + text.slice(from);
    out += text.slice(from, start);
    const end = text.indexOf("-->", start + 4);
    if (end === -1) return out;
    from = end + 3;
  }
}

const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const RULE = /^ {0,3}([-*_])( *\1){2,} *$/;
const TABLE_SEPARATOR = /^\s*\|?(\s*:?-+:?\s*\|)+(\s*:?-+:?\s*)?\s*$/;
const REFERENCE_DEFINITION = /^ {0,3}\[[^\]\n]+\]:\s/;

/** A line of prose with its block-level markers removed. */
function withoutBlockMarkers(line: string): string {
  let out = line.replace(/^\s*(?:>\s*)+/, "");
  out = out.replace(/^\s{0,3}#{1,6}\s+/, "");
  out = out.replace(/^\s*(?:[-*+]|\d{1,9}[.)])\s+/, "");
  if (/^\s*\|/.test(out) || /\|\s*$/.test(out)) out = out.replace(/\|/g, " ");
  return out;
}

/** Inline markup removed from one line of prose. Code spans are protected first. */
function withoutInlineMarkup(line: string): string {
  let out = line.replace(/`([^`\n]+)`/g, (_all, code: string) => protect(code));
  out = out.replace(/!\[([^\]\n]*)\]\((?:<[^>\n]*>[^)\n]*|[^)\n]*)\)/g, "$1");
  out = out.replace(/\[([^\]\n]*)\]\((?:<[^>\n]*>[^)\n]*|[^)\n]*)\)/g, "$1");
  out = out.replace(/\[([^\]\n]*)\]\[[^\]\n]*\]/g, "$1");
  out = out.replace(/<(https?:\/\/[^>\s]+)>/g, "$1");
  out = out.replace(/<\/?[A-Za-z][^>\n]*>/g, " ");
  out = out.replace(/\*\*(?=\S)(.+?)(?<=\S)\*\*/g, "$1");
  out = out.replace(
    /(?<![A-Za-z0-9])__(?=\S)(.+?)(?<=\S)__(?![A-Za-z0-9])/g,
    "$1",
  );
  out = out.replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "$1");
  out = out.replace(
    /(?<![A-Za-z0-9])_(?=\S)(.+?)(?<=\S)_(?![A-Za-z0-9])/g,
    "$1",
  );
  return out.replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "$1");
}

/** An artefact reference found while tagging a line for `summariseMarkdownParts`. */
type RefTag = { label: string; ulid: string | null; version: number | null };

/** Marks around a tagged reference's label, private-use codepoints outside
 * both the surrogate range and `protect`/`restore`'s sentinel range, so
 * neither step can mistake or disturb them. */
const REF_MARK_START = "";
const REF_MARK_END = "";

/** Replaces every artefact-reference link in `line` with its label wrapped
 * in ref marks, appending each one's ULID and version to `refs` in the same
 * order they appear. An invalid ULID still tags the link (so its label is
 * still shown as a chip), with a `null` ULID recorded for it. */
function markArtefactRefs(line: string, refs: RefTag[]): string {
  return line.replace(
    ARTEFACT_REF_LINK,
    (_all, label: string, titleBody: string) => {
      const parsed = parseArtefactRefTitle(titleBody);
      refs.push({
        label,
        ulid: parsed?.ulid ?? null,
        version: parsed?.version === undefined ? null : Number(parsed.version),
      });
      return `${REF_MARK_START}${label}${REF_MARK_END}`;
    },
  );
}

/** The prose and code of `text` as pieces, one per line, with markup removed.
 * With `tagRefs`, an artefact reference's label is wrapped in ref marks
 * first (`markArtefactRefs`) so `summariseMarkdownParts` can find it again
 * after the rest of the line is stripped down like any other link. */
function pieces(text: string, tagRefs = false, refs: RefTag[] = []): string[] {
  const out: string[] = [];
  let fence: string | null = null;
  for (const line of text.split("\n")) {
    const opens = FENCE.exec(line)?.[1];
    if (fence !== null) {
      if (opens !== undefined && opens.startsWith(fence.charAt(0)))
        fence = null;
      else out.push(protect(line));
    } else if (opens !== undefined) {
      fence = opens;
    } else if (
      !RULE.test(line) &&
      !(line.includes("|") && TABLE_SEPARATOR.test(line)) &&
      !REFERENCE_DEFINITION.test(line)
    ) {
      const prepared = tagRefs ? markArtefactRefs(line, refs) : line;
      out.push(withoutInlineMarkup(withoutBlockMarkers(prepared)));
    }
  }
  return out;
}

function cut(text: string, max: number): string {
  const chars = [...text];
  if (chars.length <= max) return text;
  return `${chars
    .slice(0, max - 1)
    .join("")
    .trimEnd()}…`;
}

/**
 * The text of a Markdown section as one plain line of at most `maxLength`
 * characters (at most 1,000), ending in an ellipsis if it was cut. Block
 * markers, emphasis, links, images, raw HTML, code fences and table pipes are
 * removed and the words kept. A link or artefact reference shows its label.
 * A citation such as `[@z:u:7XK2PQ9M]` is left as written until citations are
 * rendered. Only the start of a long text is read.
 */
export function summariseMarkdown(
  markdown: string,
  maxLength: number = DEFAULT_MAX,
): string {
  const max = Math.min(Math.max(Math.trunc(maxLength) || 1, 1), MAX_LENGTH);
  const window = markdown
    .slice(0, max * WINDOW_FACTOR)
    // A cut can leave half a surrogate pair, and private-use text would be read as an escape.
    .replace(UNSAFE, REPLACEMENT)
    .replace(/\r\n?/g, "\n")
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, (_all, char: string) =>
      protect(char),
    );
  const text = pieces(withoutComments(window)).join(" ");
  return cut(restore(text).replace(/\s+/g, " ").trim(), max);
}

/** One piece of a structured summary (`summariseMarkdownParts`): plain text,
 * or an artefact reference's label with the ULID and version parsed from
 * its title, for a caller that wants to show it as a chip rather than as
 * plain text (FR-TBL-05, FR-EDT-06). `ulid` is `null` for a reference whose
 * title did not hold a valid ULID; the label is still shown. */
export type SummaryPart =
  | { kind: "text"; text: string }
  | { kind: "ref"; label: string; ulid: string | null; version: number | null };

const MARKED_REF = /([^]*)/g;

function stripStrayMarks(text: string): string {
  return text.replace(/[]/g, "");
}

/** Splits `marked` (ref-tagged, joined and cut) back into parts, pairing
 * each intact ref mark with the next entry of `refs` in order: `cut` only
 * ever removes a suffix, so the marks that survive are always a prefix of
 * `refs` in the order `markArtefactRefs` recorded them. A mark truncated by
 * the cut has no closing mark left to match, so it falls through to plain
 * text instead of showing a broken chip. */
function toParts(marked: string, refs: readonly RefTag[]): SummaryPart[] {
  const parts: SummaryPart[] = [];
  let last = 0;
  let refIndex = 0;
  for (const match of marked.matchAll(MARKED_REF)) {
    const index = match.index ?? 0;
    const before = stripStrayMarks(marked.slice(last, index));
    if (before !== "") parts.push({ kind: "text", text: before });
    const label = match[1] ?? "";
    const ref = refs[refIndex];
    refIndex += 1;
    if (label !== "") {
      parts.push({
        kind: "ref",
        label,
        ulid: ref?.ulid ?? null,
        version: ref?.version ?? null,
      });
    }
    last = index + match[0].length;
  }
  const tail = stripStrayMarks(marked.slice(last));
  if (tail !== "") parts.push({ kind: "text", text: tail });
  return parts;
}

/**
 * `summariseMarkdown`, but with every artefact reference kept as its own
 * part instead of flattened into the text, so a caller can render it as a
 * chip (FR-TBL-05). The text parts and the bound on the total length are
 * otherwise identical; an ordinary link still shows only its label as text.
 */
export function summariseMarkdownParts(
  markdown: string,
  maxLength: number = DEFAULT_MAX,
): SummaryPart[] {
  const max = Math.min(Math.max(Math.trunc(maxLength) || 1, 1), MAX_LENGTH);
  const window = markdown
    .slice(0, max * WINDOW_FACTOR)
    .replace(UNSAFE, REPLACEMENT)
    .replace(/\r\n?/g, "\n")
    .replace(/\\([\\`*_{}[\]()#+\-.!|~<>])/g, (_all, char: string) =>
      protect(char),
    );
  const refs: RefTag[] = [];
  const text = pieces(withoutComments(window), true, refs).join(" ");
  const flat = restore(text).replace(/\s+/g, " ").trim();
  return toParts(cut(flat, max), refs);
}
