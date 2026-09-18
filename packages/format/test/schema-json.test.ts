import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderJsonSchemaFiles } from "../src/schema";

const schemaDir = new URL("../../../docs/format/schemas/", import.meta.url);
const formatDoc = new URL("../../../docs/format/format-v1.md", import.meta.url);

const EXPECTED_FILES = [
  "artefacts.schema.json",
  "bibliography.schema.json",
  "experiment.schema.json",
  "lock.schema.json",
  "project.schema.json",
  "question.schema.json",
  "request.schema.json",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Every property declared anywhere in a JSON Schema tree, qualified by its
 * immediate parent property: `capture.copy_threshold_mb`,
 * `columns[].key`. Top-level properties, and those declared under `$defs`
 * (the recursive group node), are unqualified. Qualifying stops a key such as
 * `_zotero.key` from masking a missing `columns[].key`.
 */
function qualifiedPropertyNames(
  node: unknown,
  parent = "",
  found = new Set<string>(),
): Set<string> {
  if (Array.isArray(node)) {
    for (const child of node) qualifiedPropertyNames(child, parent, found);
  } else if (isRecord(node)) {
    const properties = node["properties"];
    if (isRecord(properties)) {
      for (const [key, child] of Object.entries(properties)) {
        found.add(parent === "" ? key : `${parent}.${key}`);
        const isList = isRecord(child) && child["type"] === "array";
        qualifiedPropertyNames(child, isList ? `${key}[]` : key, found);
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (key !== "properties") qualifiedPropertyNames(child, parent, found);
    }
  }
  return found;
}

/** The text of every inline code span in a Markdown document. */
function codeSpans(markdown: string): Set<string> {
  const spans = new Set<string>();
  for (const match of markdown.matchAll(/`([^`\n]+)`/g)) {
    if (match[1] !== undefined) spans.add(match[1]);
  }
  return spans;
}

describe("exported JSON Schemas (docs/format/schemas)", () => {
  const rendered = renderJsonSchemaFiles();

  it("cover every notebook file kind", () => {
    expect(Object.keys(rendered).sort()).toEqual(EXPECTED_FILES);
  });

  it("are committed exactly as generated; run pnpm schemas:export after a schema change", () => {
    const committed = readdirSync(schemaDir).sort();
    expect(committed).toEqual(EXPECTED_FILES);
    for (const [file, text] of Object.entries(rendered)) {
      expect(readFileSync(new URL(file, schemaDir), "utf8"), file).toBe(text);
    }
  });

  it("use LF line endings and a single final newline", () => {
    for (const text of Object.values(rendered)) {
      expect(text.includes("\r")).toBe(false);
      expect(text.endsWith("}\n") || text.endsWith("]\n")).toBe(true);
      expect(text.endsWith("\n\n")).toBe(false);
    }
  });

  it("declare JSON Schema draft 2020-12", () => {
    for (const [file, text] of Object.entries(rendered)) {
      expect(text, file).toContain(
        '"$schema": "https://json-schema.org/draft/2020-12/schema"',
      );
    }
  });
});

describe("docs/format/format-v1.md", () => {
  const doc = readFileSync(formatDoc, "utf8");

  it("names every schema file", () => {
    for (const file of EXPECTED_FILES) expect(doc, file).toContain(file);
  });

  it("documents every property declared in any schema, by qualified name, in backticks", () => {
    const spans = codeSpans(doc);
    const missing: string[] = [];
    for (const [file, text] of Object.entries(renderJsonSchemaFiles())) {
      const parsed: unknown = JSON.parse(text);
      for (const name of qualifiedPropertyNames(parsed)) {
        // Documented as the name itself, or as a longer path that ends in it.
        const documented = [...spans].some(
          (span) => span === name || span.endsWith(`.${name}`),
        );
        if (!documented) missing.push(`${file}: ${name}`);
      }
    }
    expect(missing).toEqual([]);
  });
});
