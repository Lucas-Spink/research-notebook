import {
  Citation,
  CitationInText,
  type CitationItem,
} from "@research-notebook/format";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type AnyExtension,
  type ReactNodeViewProps,
} from "@tiptap/react";
import { CitationChip } from "../../citations";

/** One item of a citation node, read without trusting the attribute's type. */
function readItem(entry: unknown): CitationItem | null {
  if (
    typeof entry !== "object" ||
    entry === null ||
    !("citekey" in entry) ||
    typeof entry.citekey !== "string"
  )
    return null;
  const text = (key: string): string => {
    const value: unknown = Reflect.get(entry, key);
    return typeof value === "string" ? value : "";
  };
  return {
    citekey: entry.citekey,
    prefix: text("prefix"),
    suffix: text("suffix"),
    suppressAuthor: Reflect.get(entry, "suppressAuthor") === true,
  };
}

function itemsOf(value: unknown): CitationItem[] {
  return Array.isArray(value)
    ? value.flatMap((entry: unknown) => readItem(entry) ?? [])
    : [];
}

function ClusterView({ node }: ReactNodeViewProps) {
  return (
    <NodeViewWrapper as="span" contentEditable={false}>
      <CitationChip items={itemsOf(node.attrs.items)} />
    </NodeViewWrapper>
  );
}

function InTextView({ node }: ReactNodeViewProps) {
  const citekey: unknown = node.attrs.citekey;
  const locator: unknown = node.attrs.locator;
  return (
    <NodeViewWrapper as="span" contentEditable={false}>
      {typeof citekey === "string" && (
        <CitationChip
          inText
          items={[
            {
              citekey,
              suffix: typeof locator === "string" ? locator : "",
            },
          ]}
        />
      )}
    </NodeViewWrapper>
  );
}

/**
 * Attaches the interactive reference to the citation nodes for the live
 * editor (S6-T01): `[Smith 2024]` that shows its source on hover and goes to
 * it in the Bibliography on a click. `packages/format`'s nodes stay plain
 * schema definitions (AGENTS.md 4: no React there), as for the reference
 * chip; the Markdown they read and write is unchanged.
 */
export const citationChipExtensions: Record<string, AnyExtension> = {
  [Citation.name]: Citation.extend({
    addNodeView: () => ReactNodeViewRenderer(ClusterView),
  }),
  [CitationInText.name]: CitationInText.extend({
    addNodeView: () => ReactNodeViewRenderer(InTextView),
  }),
};
