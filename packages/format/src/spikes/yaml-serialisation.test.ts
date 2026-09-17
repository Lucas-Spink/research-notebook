import { describe, expect, it } from "vitest";
import { parseProjectYaml, serialiseProjectYaml } from "./yaml-serialisation";

// Fixture matching the project.yaml example in spec 5.3, keys given
// out of documented order to prove serialisation re-orders them.
const exampleFields = {
  citation_style: "nature.csl",
  locale: "en-GB",
  archived: null,
  last_written_by: "0.1.0",
  created: "2026-09-01T09:12:44Z",
  name: "Batch effects in treated organoids",
  id: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
  format_version: 1,
  numbering: { next_experiment: 43, next_question: 4 },
  capture: { evidence_in_git: false, copy_threshold_mb: 100 },
  table: {
    collapsed_questions: [],
    columns: [{ key: "motivation", width: 220, hidden: false }],
  },
  order: [
    {
      question: "01JAXA1C5D8E2F4G6H7J9K0M1N",
      experiments: ["01JAXQ8M3K7T2V9R4W6Y5Z0B1C"],
    },
  ],
  external_roots: [],
};

describe("YAML serialisation spike (spec 5.2, 5.3)", () => {
  it("writes string scalars double-quoted, not numbers, booleans or null", () => {
    const text = serialiseProjectYaml(exampleFields);

    expect(text).toContain('id: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC"');
    expect(text).toContain('name: "Batch effects in treated organoids"');
    expect(text).toContain('key: "motivation"');
    expect(text).toContain("format_version: 1");
    expect(text).toContain("archived: null");
    expect(text).toContain("evidence_in_git: false");
  });

  it("writes known top-level keys in the documented order", () => {
    const text = serialiseProjectYaml(exampleFields);
    const topLevelKeys = text
      .split("\n")
      .filter((line) => /^[a-z_]+:/.test(line))
      .map((line) => line.split(":")[0]);

    expect(topLevelKeys).toEqual([
      "format_version",
      "id",
      "name",
      "created",
      "last_written_by",
      "archived",
      "locale",
      "citation_style",
      "capture",
      "numbering",
      "order",
      "table",
      "external_roots",
    ]);
  });

  it("writes nested capture, numbering and table keys in documented order", () => {
    const text = serialiseProjectYaml(exampleFields);

    const captureIndex = text.indexOf("copy_threshold_mb");
    const evidenceIndex = text.indexOf("evidence_in_git");
    expect(captureIndex).toBeGreaterThan(-1);
    expect(captureIndex).toBeLessThan(evidenceIndex);

    const nextQuestionIndex = text.indexOf("next_question");
    const nextExperimentIndex = text.indexOf("next_experiment");
    expect(nextQuestionIndex).toBeLessThan(nextExperimentIndex);

    const columnsIndex = text.indexOf("columns");
    const collapsedIndex = text.indexOf("collapsed_questions");
    expect(columnsIndex).toBeLessThan(collapsedIndex);
  });

  it("preserves an unknown top-level key after known keys", () => {
    const withUnknown = { ...exampleFields, custom_field: "kept" };
    const text = serialiseProjectYaml(withUnknown);
    const topLevelKeys = text
      .split("\n")
      .filter((line) => /^[a-z_]+:/.test(line))
      .map((line) => line.split(":")[0]);

    expect(topLevelKeys.at(-1)).toBe("custom_field");
    expect(text).toContain('custom_field: "kept"');
  });

  it("preserves multiple unknown keys in their original relative order", () => {
    const source = [
      "format_version: 1",
      'id: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC"',
      'second_unknown: "b"',
      'first_unknown: "a"',
      'name: "Example"',
    ].join("\n");

    const parsed = parseProjectYaml(source);
    const text = serialiseProjectYaml(parsed);
    const topLevelKeys = text
      .split("\n")
      .filter((line) => /^[a-z_]+:/.test(line))
      .map((line) => line.split(":")[0]);

    expect(topLevelKeys.slice(-2)).toEqual(["second_unknown", "first_unknown"]);
  });

  it("round-trips: parse(serialise(x)) deep-equals x", () => {
    const withUnknown = { ...exampleFields, custom_field: "kept" };
    const text = serialiseProjectYaml(withUnknown);
    const parsed = parseProjectYaml(text);

    expect(parsed).toEqual(withUnknown);
  });
});
