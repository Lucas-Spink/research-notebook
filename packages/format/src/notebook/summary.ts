/**
 * Plain-text summaries of Markdown for the table's cells (FR-TBL-05). This is
 * Markdown parsing, so it lives here and nowhere else (AGENTS.md rule 2). It
 * is deliberately small: it removes markup so a cell reads as text, and never
 * needs to be exact, so an odd construct may show a stray marker but never
 * throws and never takes long.
 */

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

/** The prose and code of `text` as pieces, one per line, with markup removed. */
function pieces(text: string): string[] {
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
      out.push(withoutInlineMarkup(withoutBlockMarkers(line)));
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
