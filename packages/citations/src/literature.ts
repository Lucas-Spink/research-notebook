import type { Citation } from "citeproc";
import { createState, handleMessage, type CslItem } from "./engine";

/** One citation item as written (spec 5.7); the shape `packages/format` reads from the text. */
export interface CitedItem {
  prefix: string;
  suppressAuthor: boolean;
  citekey: string;
  suffix: string;
}

/** One citation as written: the unit of an experiment's citation context (FR-CIT-09). */
export interface CitationCluster {
  items: readonly CitedItem[];
}

/** A `bibliography.json` item; `id` is its citekey. Other CSL fields pass to citeproc unchanged. */
export type LiteratureSource = CslItem;

export interface LiteratureInput {
  /** Methods then Interpretation, in document order. */
  clusters: readonly CitationCluster[];
  /** Every source in `bibliography.json`, whatever its status (FR-CIT-08). */
  items: readonly LiteratureSource[];
  styleXml: string;
  localeXml: string;
}

export interface LiteratureOutput {
  /** The block's content, or "" when nothing resolved to an entry. */
  text: string;
  /** Rendered entries, in the style's bibliography order. */
  entries: readonly string[];
  /** Cited citekeys with no item in `bibliography.json`, in order of first appearance. */
  unresolved: readonly string[];
}

export type LiteratureResult =
  | { ok: true; value: LiteratureOutput }
  | { ok: false; error: { message: string } };

const HEADING = "## Literature";

const ENTITIES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(html: string): string {
  return html.replace(
    /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi,
    (whole, name: string) => {
      if (name.startsWith("#x"))
        return String.fromCodePoint(parseInt(name.slice(2), 16));
      if (name.startsWith("#"))
        return String.fromCodePoint(parseInt(name.slice(1), 10));
      return ENTITIES[name.toLowerCase()] ?? whole;
    },
  );
}

/**
 * One citeproc bibliography entry (HTML) as Markdown text: italics and bold
 * keep their emphasis, every other tag is dropped, entities are decoded.
 */
function entryToMarkdown(html: string): string {
  const marked = html
    .replace(/<\/?(?:i|em)\b[^>]*>/gi, "*")
    .replace(/<\/?(?:b|strong)\b[^>]*>/gi, "**")
    .replace(/<\/div>\s*<div\b/gi, "</div> <div")
    .replace(/<[^>]+>/g, "");
  return decodeEntities(marked).replace(/\s+/g, " ").trim();
}

function toCitation(cluster: CitationCluster, index: number): Citation {
  return {
    citationID: `c${index}`,
    citationItems: cluster.items.map((item) => ({
      id: item.citekey,
      prefix: item.prefix,
      suffix: item.suffix,
      "suppress-author": item.suppressAuthor,
    })),
    properties: { noteIndex: 0 },
  };
}

/** Keeps the items citeproc can resolve; reports the rest once each. */
function resolve(
  clusters: readonly CitationCluster[],
  known: ReadonlyMap<string, LiteratureSource>,
): { clusters: CitationCluster[]; unresolved: string[] } {
  const unresolved = new Set<string>();
  const kept: CitationCluster[] = [];
  for (const cluster of clusters) {
    const items = cluster.items.filter((item) => {
      if (known.has(item.citekey)) return true;
      unresolved.add(item.citekey);
      return false;
    });
    if (items.length > 0) kept.push({ items });
  }
  return { clusters: kept, unresolved: [...unresolved] };
}

/** Numbered entries read as a tight list; anything else needs a blank line between paragraphs. */
function joinEntries(entries: readonly string[]): string {
  const numbered = entries.every((entry) => /^\d+\.\s/.test(entry));
  return entries.join(numbered ? "\n" : "\n\n");
}

/**
 * Renders the Literature block's content for an experiment's citation
 * context (FR-CIT-09, FR-CIT-10) from `bibliography.json` alone (FR-CIT-06):
 * one entry per distinct source, numbered by first appearance in numbered
 * styles. Pure and deterministic, so the application can tell a hand-edited
 * block from a stale one by regenerating and comparing (format-v1.md, open
 * question 1). Failures of the style or engine come back as `ok: false`.
 */
export function renderLiterature(input: LiteratureInput): LiteratureResult {
  const known = new Map(input.items.map((item) => [item.id, item]));
  const { clusters, unresolved } = resolve(input.clusters, known);
  if (clusters.length === 0) {
    return { ok: true, value: { text: "", entries: [], unresolved } };
  }
  try {
    const cited = new Set(
      clusters.flatMap((c) => c.items.map((i) => i.citekey)),
    );
    const items = Object.fromEntries(
      [...cited].flatMap((id) => {
        const item = known.get(id);
        return item === undefined ? [] : [[id, item] as const];
      }),
    );
    let state = handleMessage(createState(), {
      type: "init",
      styleXml: input.styleXml,
      localeXml: input.localeXml,
      items,
    }).state;
    const processed: [string, number][] = [];
    clusters.forEach((cluster, index) => {
      const citation = toCitation(cluster, index);
      state = handleMessage(state, {
        type: "cite",
        citation,
        citationsPre: [...processed],
        citationsPost: [],
      }).state;
      processed.push([citation.citationID, 0]);
    });
    const response = handleMessage(state, { type: "bibliography" }).response;
    if (response.type !== "bibliography") {
      return { ok: false, error: { message: "unexpected engine response" } };
    }
    const entries = response.entries
      .map(entryToMarkdown)
      .filter((e) => e !== "");
    const text =
      entries.length === 0 ? "" : `${HEADING}\n\n${joinEntries(entries)}`;
    return { ok: true, value: { text, entries, unresolved } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: { message } };
  }
}
