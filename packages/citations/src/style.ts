import { EN_US_LOCALE } from "./bundled";
import { renderLiterature } from "./literature";

/** Largest style file accepted; real styles are tens of kilobytes. */
export const MAX_STYLE_BYTES = 1024 * 1024;

export type StyleProblem =
  /** Nothing to read, or text that is not a CSL `<style>`. */
  | { kind: "notCsl" }
  | { kind: "tooLarge" }
  /** `class="note"`: footnote styles need note positions the notebook does not have (FR-CIT-11). */
  | { kind: "noteStyle" }
  /** Points at a parent style (`independent-parent`) that cannot be fetched offline. */
  | { kind: "dependent" }
  | { kind: "noCitation" }
  /** citeproc-js could not run it on a sample citation. */
  | { kind: "unusable" };

export type CheckedStyle = {
  title: string;
  id: string;
  /** The text to store: LF line endings, no byte order mark (format-v1.md 4). */
  xml: string;
};

export type StyleCheck =
  { ok: true; value: CheckedStyle } | { ok: false; error: StyleProblem };

const fail = (error: StyleProblem): StyleCheck => ({ ok: false, error });

const CSL_NAMESPACE = "http://purl.org/net/xbiblio/csl";

/** The text with comments, the XML declaration, processing instructions and DOCTYPE removed. */
function withoutProlog(xml: string): string {
  return xml
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "");
}

function attributeOf(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(
    tag,
  );
  return match === null ? null : (match[2] ?? match[3] ?? null);
}

function elementText(xml: string, name: string): string | null {
  const match = new RegExp(`<${name}>([^<]*)</${name}>`).exec(xml);
  const text = match?.[1]?.trim();
  return text === undefined || text === "" ? null : text;
}

const SAMPLE = {
  id: "sample",
  type: "book",
  title: "Sample",
  author: [{ family: "Doe", given: "Jane" }],
  issued: { "date-parts": [[2020]] },
};

/**
 * Whether `text` can be the project's citation style (FR-CIT-11): an
 * independent in-text CSL style with a citation layout that citeproc-js can
 * run. Note styles are refused. Looks at the root element only, so a note
 * class in a comment or a later element changes nothing. Never throws.
 */
export function validateStyle(text: string): StyleCheck {
  if (text.length > MAX_STYLE_BYTES) return fail({ kind: "tooLarge" });
  const xml = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const body = withoutProlog(xml);
  const root = /^\s*<style\b[^>]*>/.exec(body)?.[0];
  if (root === undefined || attributeOf(root, "xmlns") !== CSL_NAMESPACE) {
    return fail({ kind: "notCsl" });
  }
  const kind = attributeOf(root, "class");
  if (kind === "note") return fail({ kind: "noteStyle" });
  if (kind !== "in-text") return fail({ kind: "notCsl" });
  if (/\brel\s*=\s*["']independent-parent["']/.test(body)) {
    return fail({ kind: "dependent" });
  }
  if (!/<citation[\s>]/.test(body) || !/<layout[\s>]/.test(body)) {
    return fail({ kind: "noCitation" });
  }
  const title = elementText(body, "title");
  const id = elementText(body, "id");
  if (title === null || id === null) return fail({ kind: "notCsl" });
  if (!runs(xml)) return fail({ kind: "unusable" });
  return { ok: true, value: { title, id, xml } };
}

function runs(styleXml: string): boolean {
  try {
    const rendered = renderLiterature({
      clusters: [
        {
          items: [
            {
              prefix: "",
              suppressAuthor: false,
              citekey: "sample",
              suffix: "",
            },
          ],
        },
      ],
      items: [SAMPLE],
      styleXml,
      localeXml: EN_US_LOCALE,
    });
    return rendered.ok;
  } catch {
    return false;
  }
}

const MAX_NAME = 64;
const SUFFIX = ".csl";

/**
 * A safe `styles/` file name from a title or a chosen file name: lower-case
 * letters, digits and hyphens, at most 64 characters, ending `.csl`. The
 * result maps to itself, so a name that is already safe is kept.
 */
export function styleFileName(input: string): string {
  const stem = input
    .toLowerCase()
    .replace(/\.csl$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_NAME - SUFFIX.length)
    .replace(/-+$/g, "");
  return `${stem === "" ? "style" : stem}${SUFFIX}`;
}
