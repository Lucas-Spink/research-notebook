import { LineCounter, isAlias, isScalar, parseDocument, visit } from "yaml";
import { fail, ok, type FormatError, type Result } from "../result";

/**
 * Reads YAML the way format-v1.md 3.4 requires: YAML 1.2 core schema, one
 * document, no anchors, aliases or tags, no duplicate keys, and no integer
 * a double cannot hold exactly. Anything else is a syntax error, because
 * these constructs make round-tripping ambiguous or would silently change a
 * value the application must preserve (ADR-0019).
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
      const message =
        what !== null
          ? `YAML ${what}s are not allowed in notebook files (no anchors, aliases or tags)`
          : isScalar(node) && isUnsafeInteger(node.value, node.source)
            ? `integer ${node.source ?? ""} is beyond ±${Number.MAX_SAFE_INTEGER} and cannot be stored exactly; write it as a quoted string`
            : null;
      if (message === null) return undefined;
      forbidden.push({
        kind: "syntax",
        message,
        line: lines.linePos(node.range?.[0] ?? 0).line,
      });
      return visit.BREAK;
    },
  });
  const [problem] = forbidden;
  if (problem !== undefined) return fail(problem);

  return ok(doc.toJS());
}

const INTEGER_LITERAL = /^[-+]?(?:\d+|0x[0-9a-fA-F]+|0o[0-7]+)$/;

/**
 * True for an integer written in the file whose value a double cannot hold.
 * Floats such as `1e300` are excluded: they read and write back to the same
 * number, whereas an integer above 2^53 - 1 is rounded and would be written
 * back as different digits.
 */
function isUnsafeInteger(value: unknown, source: string | undefined): boolean {
  return (
    typeof value === "number" &&
    !Number.isSafeInteger(value) &&
    source !== undefined &&
    INTEGER_LITERAL.test(source)
  );
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
