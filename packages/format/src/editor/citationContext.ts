import type { JSONContent } from "@tiptap/core";
import type { ExperimentBodyModel } from "../schema";
import {
  CITATION_IN_TEXT_NODE_NAME,
  CITATION_NODE_NAME,
  scanCitations,
  type CitationItem,
} from "./citation";
import { parseSectionMarkdown } from "./markdown";
import { PASSTHROUGH_NODE_NAME } from "./passthrough";

/** One citation as written: the unit citeproc is given (spec 5.7). */
export interface CitationCluster {
  items: CitationItem[];
}

function isItem(value: unknown): value is CitationItem {
  return (
    typeof value === "object" &&
    value !== null &&
    "citekey" in value &&
    typeof value.citekey === "string"
  );
}

function citationNodeClusters(node: JSONContent): CitationCluster[] {
  const items: unknown = node.attrs?.items;
  return Array.isArray(items) ? [{ items: items.filter(isItem) }] : [];
}

function inTextNodeClusters(node: JSONContent): CitationCluster[] {
  const citekey: unknown = node.attrs?.citekey;
  const locator: unknown = node.attrs?.locator;
  if (typeof citekey !== "string") return [];
  const suffix = typeof locator === "string" ? locator : "";
  return [{ items: [{ prefix: "", suppressAuthor: false, citekey, suffix }] }];
}

function passthroughClusters(node: JSONContent): CitationCluster[] {
  const raw: unknown = node.attrs?.markdown;
  return typeof raw === "string"
    ? scanCitations(raw).map((items) => ({ items }))
    : [];
}

function clustersOf(node: JSONContent): CitationCluster[] {
  if (node.type === CITATION_NODE_NAME) return citationNodeClusters(node);
  if (node.type === CITATION_IN_TEXT_NODE_NAME) return inTextNodeClusters(node);
  if (node.type === PASSTHROUGH_NODE_NAME) return passthroughClusters(node);
  return (node.content ?? []).flatMap(clustersOf);
}

/**
 * The citations in one section's Markdown, in document order, with every
 * hand-written form included. Parsed by the same parser as the editor, so
 * what counts as a citation is decided in one place (AGENTS.md rule 2).
 */
export function citationClusters(markdown: string): CitationCluster[] {
  if (markdown === "") return [];
  return clustersOf(parseSectionMarkdown(markdown));
}

/**
 * An experiment's citation context (FR-CIT-09): Methods, then
 * Interpretation, each in document order, whatever order the file stores
 * them in. Results notes are never part of it.
 */
export function citationContext(body: ExperimentBodyModel): CitationCluster[] {
  const text = (key: "methods" | "interpretation") =>
    body.sections.find((section) => section.key === key)?.body ?? "";
  return [
    ...citationClusters(text("methods")),
    ...citationClusters(text("interpretation")),
  ];
}
