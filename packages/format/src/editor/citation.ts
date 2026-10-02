import type { Attributes, JSONContent, MarkdownToken } from "@tiptap/core";
import { Node } from "@tiptap/core";
import { Citekey } from "../schema";

/**
 * Node name for a bracketed Pandoc citation cluster (spec 5.7, FR-CIT-03):
 * one or more citekeys, each with its own prefix, suppress-author flag and
 * suffix (locator). Rendered minimally here (the raw citekeys joined by
 * "; "); CSL-resolved chip text and source-details activation are a later
 * task (FR-CIT-04, S5-T07).
 */
export const CITATION_NODE_NAME = "citation";

/**
 * Node name for a hand-written "author-in-text" citation (spec 5.7): a bare
 * `@citekey`, not inside brackets, optionally followed by a single space and
 * a bracketed locator written by hand, e.g. `@z:u:7XK2PQ9M [p. 4]`. The
 * editor never inserts this form ("The editor inserts bracketed citations
 * only"); this node exists purely so it round-trips byte-identically
 * instead of having its locator bracket corrupted by the generic text
 * serialiser's Markdown escaping (`[`/`]` are escaped in ordinary text).
 */
export const CITATION_IN_TEXT_NODE_NAME = "citationInText";

/** One citekey within a bracketed citation cluster. */
export interface CitationItem {
  /** Free text before the citekey, verbatim including any trailing space. */
  prefix: string;
  /** Whether this item used the `-@citekey` suppress-author form. */
  suppressAuthor: boolean;
  citekey: string;
  /** Free text after the first comma (locator and/or other suffix text), or "". */
  suffix: string;
}

// Cheap candidate detection only: neither regex below encodes the citekey
// grammar itself. `Citekey` (schema/common.ts) is the one shared validator
// that decides what counts as a real citekey, so there is no second,
// possibly drifting pattern to keep in sync with it (the same approach
// `./artefactRef.ts` takes with `Ulid`).
const CITATION_SEARCH = /\[[^\]\n]*@[^\]\n]*\]/;
const CITATION_ANCHORED = /^\[([^\]\n]*@[^\]\n]*)\]/;
// Splits one semicolon-separated item into prefix, optional suppress-author
// "-", a citekey candidate (the run of non-whitespace right after "@") and
// an optional suffix (everything after the first comma). The lazy citekey
// group backtracks until what follows is either a comma or the end, so it
// never swallows a trailing ", <suffix>" as part of the citekey.
const CITATION_ITEM = /^(.*?)(-)?@(\S+?)(?:,\s*(.*))?$/;

/** Parses a citation cluster's body (the text between `[` and `]`) into its
 * items, or `null` if any item's citekey is not valid — the whole cluster is
 * then left as ordinary bracketed text, matching `artefactRef.ts`'s "any
 * invalidity falls through" rule. */
function parseCitationBody(body: string): CitationItem[] | null {
  const items: CitationItem[] = [];
  for (const rawPart of body.split(";")) {
    const match = CITATION_ITEM.exec(rawPart.trim());
    if (!match) return null;
    const [, prefix, suppress, citekey] = match;
    const suffix = match[4];
    if (citekey === undefined || !Citekey.safeParse(citekey).success) {
      return null;
    }
    items.push({
      prefix: prefix ?? "",
      suppressAuthor: suppress === "-",
      citekey,
      suffix: suffix ?? "",
    });
  }
  return items.length > 0 ? items : null;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`expected token.${field} to be a string`);
  }
  return value;
}

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
    throw new Error("expected token.items to be an array of citation items");
  }
  return value;
}

function itemMarkdown(item: CitationItem): string {
  const suffixPart = item.suffix ? `, ${item.suffix}` : "";
  return `${item.prefix}${item.suppressAuthor ? "-" : ""}@${item.citekey}${suffixPart}`;
}

const citationAttributes: Attributes = {
  items: { default: [] },
};

/**
 * A bracketed citation cluster (spec 5.7): `[@key]`, `[see @key, fig. 2;
 * @key2, pp. 10-12]`, `[-@key]`. `packages/format` does no I/O and imports
 * no UI framework (AGENTS.md 4); `parseHTML`/`renderHTML` here are only the
 * headless fallback, matching `./artefactRef.ts`.
 */
export const Citation = Node.create({
  name: CITATION_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => citationAttributes,
  parseHTML: () => [{ tag: `span[data-${CITATION_NODE_NAME}]` }],
  renderHTML: ({ node }) => [
    "span",
    { [`data-${CITATION_NODE_NAME}`]: "" },
    expectCitationItems(node.attrs.items)
      .map((item) => `@${item.citekey}`)
      .join("; "),
  ],
  markdownTokenName: CITATION_NODE_NAME,
  markdownTokenizer: {
    name: CITATION_NODE_NAME,
    level: "inline",
    start(src: string) {
      const match = CITATION_SEARCH.exec(src);
      return match ? match.index : -1;
    },
    // Returning `undefined` for anything that isn't a real citation cluster
    // lets marked fall through to its default handling of "[...]" (ordinary
    // text, since it is not followed by "(url)"), the same rule
    // `./artefactRef.ts` follows for an invalid ULID.
    tokenize(src: string) {
      const match = CITATION_ANCHORED.exec(src);
      if (!match) return undefined;
      const [raw, body] = match;
      const items = parseCitationBody(body ?? "");
      if (items === null) return undefined;
      // Named `citationItems`, not `items`: `isRepresentable` (./passthrough.ts)
      // treats any token's `items` field as child tokens to recurse into
      // (marked's own convention for a "list" token's list items), and would
      // misread this plain data array's entries — none of which have a
      // `.type` — as unrepresentable child tokens.
      return { type: CITATION_NODE_NAME, raw, citationItems: items };
    },
  },
  parseMarkdown: (token: MarkdownToken) => ({
    type: CITATION_NODE_NAME,
    attrs: { items: expectCitationItems(token.citationItems) },
  }),
  renderMarkdown: (node: JSONContent) => {
    const items = expectCitationItems(node.attrs?.items);
    return `[${items.map(itemMarkdown).join("; ")}]`;
  },
});

/** The Tiptap JSON for a citation cluster built from `items`. */
export function buildCitationNode(items: CitationItem[]): JSONContent {
  return { type: CITATION_NODE_NAME, attrs: { items } };
}

// Cheap candidate detection only, same reasoning as CITATION_SEARCH above:
// the citekey run after "@" is validated by `Citekey`, not by this pattern.
// A citekey candidate stops at whitespace or "[" so it never absorbs a
// following locator bracket or run on into surrounding prose.
const CITATION_IN_TEXT_SEARCH = /@[^\s[\]]/;
// The optional locator bracket requires exactly one literal space before
// "[" (matching spec 5.7's own example, "@z:u:7XK2PQ9M [p. 4]") and excludes
// "@" from its content, so it can never absorb the start of a following,
// independent bracketed citation cluster.
const CITATION_IN_TEXT_ANCHORED = /^@([^\s[\]]+)(?: \[([^\]@\n]*)\])?/;

const citationInTextAttributes: Attributes = {
  citekey: { default: null },
  locator: { default: null },
};

/**
 * A hand-written author-in-text citation (spec 5.7): see
 * `CITATION_IN_TEXT_NODE_NAME`'s doc comment. Never produced by the editor
 * itself, only preserved when parsing existing text.
 */
export const CitationInText = Node.create({
  name: CITATION_IN_TEXT_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => citationInTextAttributes,
  parseHTML: () => [{ tag: `span[data-${CITATION_IN_TEXT_NODE_NAME}]` }],
  renderHTML: ({ node }) => [
    "span",
    { [`data-${CITATION_IN_TEXT_NODE_NAME}`]: "" },
    `@${expectString(node.attrs.citekey, "citekey")}`,
  ],
  markdownTokenName: CITATION_IN_TEXT_NODE_NAME,
  markdownTokenizer: {
    name: CITATION_IN_TEXT_NODE_NAME,
    level: "inline",
    start(src: string) {
      const match = CITATION_IN_TEXT_SEARCH.exec(src);
      return match ? match.index : -1;
    },
    tokenize(src: string) {
      const match = CITATION_IN_TEXT_ANCHORED.exec(src);
      if (!match) return undefined;
      const [raw, citekey, locator] = match;
      if (citekey === undefined || !Citekey.safeParse(citekey).success) {
        return undefined;
      }
      return { type: CITATION_IN_TEXT_NODE_NAME, raw, citekey, locator };
    },
  },
  parseMarkdown: (token: MarkdownToken) => ({
    type: CITATION_IN_TEXT_NODE_NAME,
    attrs: {
      citekey: expectString(token.citekey, "citekey"),
      locator:
        token.locator === undefined
          ? null
          : expectString(token.locator, "locator"),
    },
  }),
  renderMarkdown: (node: JSONContent) => {
    const citekey = expectString(node.attrs?.citekey, "citekey");
    const locatorPart =
      typeof node.attrs?.locator === "string" ? ` [${node.attrs.locator}]` : "";
    return `@${citekey}${locatorPart}`;
  },
});

/**
 * Every citation written in `text`, in order, found without a document: for
 * the raw Markdown of a passthrough block (a table, say), which the editor
 * keeps verbatim but whose citations still belong in the citation context
 * (FR-CIT-09). Uses the same anchored patterns and `Citekey` check as the
 * node tokenizers above, so both agree on what a citation is.
 */
export function scanCitations(text: string): CitationItem[][] {
  const found: CitationItem[][] = [];
  let at = 0;
  while (at < text.length) {
    const rest = text.slice(at);
    const bracketed = text[at] === "[" ? CITATION_ANCHORED.exec(rest) : null;
    const items =
      bracketed === null ? null : parseCitationBody(bracketed[1] ?? "");
    if (bracketed !== null && items !== null) {
      found.push(items);
      at += bracketed[0].length;
      continue;
    }
    const inText =
      text[at] === "@" ? CITATION_IN_TEXT_ANCHORED.exec(rest) : null;
    const citekey = inText?.[1];
    if (inText !== null && citekey !== undefined) {
      if (Citekey.safeParse(citekey).success) {
        found.push([
          {
            prefix: "",
            suppressAuthor: false,
            citekey,
            suffix: inText[2] ?? "",
          },
        ]);
        at += inText[0].length;
        continue;
      }
    }
    at += 1;
  }
  return found;
}
