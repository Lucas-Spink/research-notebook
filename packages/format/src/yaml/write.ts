import { Document, isPair, isScalar, isSeq, visit } from "yaml";

/**
 * Writes a value as canonical YAML (format-v1.md 3.4): double-quoted strings
 * with JSON escapes, plain keys, two-space indentation, no line folding, and
 * flow style only where `flowPaths` says so.
 *
 * A path is the dotted list of keys from the root to a mapping, with `*`
 * standing for any sequence index, for example `table.columns.*`.
 */
export function writeYaml(
  value: unknown,
  flowPaths: readonly string[] = [],
): string {
  // Sharing an object between two places must not turn into an anchor.
  const doc = new Document(value, { aliasDuplicateObjects: false });
  const flow = new Set(flowPaths);
  if (flow.size > 0) {
    visit(doc, {
      Map(_key, node, path) {
        if (flow.has(keyPath(path))) node.flow = true;
      },
    });
  }
  return doc.toString({
    indent: 2,
    indentSeq: true,
    lineWidth: 0,
    flowCollectionPadding: false,
    defaultKeyType: "PLAIN",
    defaultStringType: "QUOTE_DOUBLE",
    // Keeps every string on one line with JSON escapes instead of folding
    // long strings that contain a newline.
    doubleQuotedAsJSON: true,
  });
}

function keyPath(ancestors: readonly unknown[]): string {
  const parts: string[] = [];
  for (const ancestor of ancestors) {
    if (isPair(ancestor) && isScalar(ancestor.key)) {
      parts.push(String(ancestor.key.value));
    } else if (isSeq(ancestor)) {
      parts.push("*");
    }
  }
  return parts.join(".");
}
