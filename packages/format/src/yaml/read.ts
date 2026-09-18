import { LineCounter, isAlias, parseDocument, visit } from "yaml";
import { fail, ok, type FormatError, type Result } from "../result";

/**
 * Reads YAML the way format-v1.md 3.4 requires: YAML 1.2 core schema, one
 * document, no anchors, aliases or tags, no duplicate keys. Anything else
 * is a syntax error, because these constructs make round-tripping ambiguous.
 */
export function readYaml(text: string): Result<unknown, FormatError> {
  const lines = new LineCounter();
  const doc = parseDocument(text, {
    version: "1.2",
    schema: "core",
    uniqueKeys: true,
    merge: false,
    lineCounter: lines,
  });

  const [first] = doc.errors;
  if (first !== undefined) {
    return fail({
      kind: "syntax",
      message: describeYamlError(first.code, first.message),
      line: first.linePos?.[0].line ?? 1,
    });
  }

  const forbidden: FormatError[] = [];
  visit(doc, {
    Node(_key, node) {
      const what = isAlias(node)
        ? "alias"
        : node.anchor
          ? "anchor"
          : node.tag
            ? "tag"
            : null;
      if (what === null) return undefined;
      forbidden.push({
        kind: "syntax",
        message: `YAML ${what}s are not allowed in notebook files (no anchors, aliases or tags)`,
        line: lines.linePos(node.range?.[0] ?? 0).line,
      });
      return visit.BREAK;
    },
  });
  const [problem] = forbidden;
  if (problem !== undefined) return fail(problem);

  return ok(doc.toJS());
}

function describeYamlError(code: string, message: string): string {
  const firstLine = message.split("\n")[0] ?? message;
  switch (code) {
    case "DUPLICATE_KEY":
      return `duplicate key: ${firstLine}`;
    case "MULTIPLE_DOCS":
      return "multiple documents are not allowed in a notebook file";
    default:
      return `invalid YAML: ${firstLine}`;
  }
}
