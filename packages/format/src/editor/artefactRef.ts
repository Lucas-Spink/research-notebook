import type { Attributes, JSONContent, MarkdownToken } from "@tiptap/core";
import { Node } from "@tiptap/core";
import { Ulid } from "../schema";

/**
 * Node name for a reference to an artefact's version (spec 5.6, FR-EDT-04 to
 * FR-EDT-06). Rendered minimally here (a plain inline label); the chip
 * styling, hover detail and click-to-preview are S4-T03.
 */
export const ARTEFACT_REF_NODE_NAME = "artefactRef";

// A reference is a Markdown link whose title starts "art:" (spec 5.6). This
// only has to find candidates cheaply; `Ulid` (packages/format/src/schema,
// the one validator the rest of the format uses) decides whether the ULID
// inside is actually valid, so there is no second, possibly drifting
// pattern to keep in sync with it.
const ARTEFACT_REF_SEARCH = /\[[^\]]*\]\([^\s)]+\s+"art:[^"]*"\)/;
const ARTEFACT_REF_ANCHORED = /^\[([^\]]*)\]\(([^\s)]+)\s+"art:([^"]*)"\)/;
const VERSIONED_ULID = /^([0-9A-Z]{26})(?: v(\d+))?$/;

/**
 * Every artefact-reference link in a block of text, not just at its start
 * (spec 5.6: a Markdown link whose title starts "art:"). Unlike
 * `ARTEFACT_REF_SEARCH` this also accepts an angle-bracketed target, so it
 * matches whatever `ARTEFACT_REF_ANCHORED` would once cut to that point.
 * Used by `notebook/summary.ts`, which reads a section's raw Markdown
 * directly rather than through the editor's tokenizer.
 */
export const ARTEFACT_REF_LINK =
  /\[([^\]\n]*)\]\((?:<[^>\n]*>|[^\s()\n]+)\s+"art:([^"\n]*)"\)/g;

/**
 * Parses a reference's title body (the text after `art:`, before the
 * closing quote): the ULID and, for copy mode, the version as written, or
 * `null` if the ULID is not valid. Shared with `notebook/summary.ts` so
 * there is one place that decides what counts as a reference.
 */
export function parseArtefactRefTitle(
  titleBody: string,
): { ulid: string; version: string | undefined } | null {
  const parts = VERSIONED_ULID.exec(titleBody);
  if (!parts) return null;
  const [, ulid, version] = parts;
  if (ulid === undefined || !Ulid.safeParse(ulid).success) return null;
  return { ulid, version };
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`expected token.${field} to be a string`);
  }
  return value;
}

const artefactRefAttributes: Attributes = {
  ulid: { default: null },
  version: { default: null },
  label: { default: "" },
  target: { default: "" },
};

/**
 * An artefact reference (spec 5.6): an inline, atomic node pinned to one
 * ULID and, for a captured (copy-mode) artefact, one version (FR-EDT-05).
 * `packages/format` does no I/O and imports no UI framework (AGENTS.md 4);
 * `parseHTML`/`renderHTML` here are only the headless fallback, matching
 * `./passthrough.ts`'s Passthrough node.
 */
export const ArtefactRef = Node.create({
  name: ARTEFACT_REF_NODE_NAME,
  group: "inline",
  inline: true,
  atom: true,
  addAttributes: () => artefactRefAttributes,
  parseHTML: () => [{ tag: `span[data-${ARTEFACT_REF_NODE_NAME}]` }],
  renderHTML: ({ node }) => [
    "span",
    { [`data-${ARTEFACT_REF_NODE_NAME}`]: "" },
    typeof node.attrs.label === "string" ? node.attrs.label : "",
  ],
  markdownTokenName: ARTEFACT_REF_NODE_NAME,
  markdownTokenizer: {
    name: ARTEFACT_REF_NODE_NAME,
    level: "inline",
    start(src: string) {
      const match = ARTEFACT_REF_SEARCH.exec(src);
      return match ? match.index : -1;
    },
    // Returning `undefined` (not throwing) for anything that isn't a real
    // reference lets marked fall through to the ordinary link tokenizer —
    // spec 5.6: "A link whose title does not begin with art: is an ordinary
    // link", and the same holds for an art:-prefixed title that does not
    // hold a valid ULID.
    tokenize(src: string) {
      const match = ARTEFACT_REF_ANCHORED.exec(src);
      if (!match) return undefined;
      const [raw, label, target, titleBody] = match;
      const parsed = parseArtefactRefTitle(titleBody ?? "");
      if (parsed === null) return undefined;
      return {
        type: ARTEFACT_REF_NODE_NAME,
        raw,
        label,
        target,
        ulid: parsed.ulid,
        version: parsed.version,
      };
    },
  },
  parseMarkdown: (token: MarkdownToken) => ({
    type: ARTEFACT_REF_NODE_NAME,
    attrs: {
      ulid: expectString(token.ulid, "ulid"),
      version:
        token.version === undefined
          ? null
          : Number(expectString(token.version, "version")),
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
      attrs.version == null ? "" : ` v${String(attrs.version)}`;
    return `[${label}](${target} "art:${ulid}${versionPart}")`;
  },
});

/** The Tiptap JSON for a reference pinned to a version (FR-EDT-05). */
export function buildArtefactRefNode(attrs: {
  ulid: string;
  version: number | null;
  label: string;
  target: string;
}): JSONContent {
  return { type: ARTEFACT_REF_NODE_NAME, attrs };
}
