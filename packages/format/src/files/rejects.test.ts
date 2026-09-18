import { describe, expect, it } from "vitest";
import { readGolden } from "../../test/golden";
import type { FormatError, Result } from "../result";
import { parseArtefacts } from "./artefacts";
import { parseExperiment } from "./experiment";
import { parseProject } from "./project";
import { parseQuestion } from "./question";
import { parseRequest } from "./request";

/**
 * Every rejection named in format-v1.md. A rejected file returns a typed
 * error and never throws, so the caller can leave it untouched and open it
 * read-only (AGENTS.md section 2, rule 5). Each test checks the reason as
 * well as the kind, so a file cannot pass by being rejected for the wrong
 * cause.
 */

function errorOf(result: Result<unknown>): FormatError {
  if (result.ok) throw new Error("expected the file to be rejected");
  return result.error;
}

function expectReason(
  error: FormatError,
  kind: FormatError["kind"],
  reason: RegExp,
): void {
  expect(error.kind).toBe(kind);
  expect(error.message).toMatch(reason);
  expect(error.message).not.toMatch(/not implemented/);
}

function schemaPaths(error: FormatError): string[] {
  if (error.kind !== "schema")
    throw new Error(`expected a schema error, got ${error.kind}`);
  return error.issues.map((issue) => issue.path);
}

const project = readGolden("project.yaml");
const artefacts = readGolden("artefacts.yaml");
const request = readGolden("request-copy.json");

const anchored = project.replace('name: "Batch', 'name: &n "Batch');

describe("project.yaml", () => {
  it.each([
    ["an anchor", anchored, /anchor/i],
    ["an alias", `${anchored}x_copy: *n\n`, /anchor|alias/i],
    [
      "an explicit tag",
      project.replace('name: "Batch', 'name: !!str "Batch'),
      /tag/i,
    ],
    ["a duplicate key", `${project}name: "again"\n`, /duplicate/i],
    ["a second document", `${project}---\nformat_version: 1\n`, /document/i],
    ["invalid YAML", "name: [unclosed\n", /./],
  ])("rejects %s as a syntax error", (_name, text, reason) => {
    expectReason(errorOf(parseProject(text)), "syntax", reason);
  });

  it("rejects a top-level list", () => {
    expect(errorOf(parseProject("- 1\n- 2\n")).kind).toBe("schema");
  });

  it("rejects a timestamp with a fraction", () => {
    const text = project.replace(
      "2026-09-01T09:12:44Z",
      "2026-09-01T09:12:44.000Z",
    );
    expect(schemaPaths(errorOf(parseProject(text)))).toContain("created");
  });

  it("rejects a timestamp with an offset", () => {
    const text = project.replace(
      "2026-09-01T09:12:44Z",
      "2026-09-01T09:12:44+01:00",
    );
    expect(schemaPaths(errorOf(parseProject(text)))).toContain("created");
  });

  it("rejects a missing required key and names it", () => {
    const text = project.replace('locale: "en-GB"\n', "");
    expect(schemaPaths(errorOf(parseProject(text)))).toContain("locale");
  });

  it("rejects a format version that is a string", () => {
    const text = project.replace("format_version: 1", 'format_version: "1"');
    expect(schemaPaths(errorOf(parseProject(text)))).toContain(
      "format_version",
    );
  });

  it("reports a newer format version before validating anything else", () => {
    const error = errorOf(
      parseProject("format_version: 2\nsomething_new: true\n"),
    );
    expect(error).toMatchObject({ kind: "unsupported-version", found: 2 });
  });
});

describe("artefacts.yaml", () => {
  it("reports a newer format version", () => {
    const text = artefacts.replace("format_version: 1", "format_version: 2");
    expect(errorOf(parseArtefacts(text))).toMatchObject({
      kind: "unsupported-version",
      found: 2,
    });
  });

  it("rejects a repeated artefact id", () => {
    const text = artefacts.replaceAll(
      "01JAXR6E1F3G5H7J9K1M3N5P7Q",
      "01JAXR5D8K2M4N6P8Q0R2S4T6V",
    );
    expect(schemaPaths(errorOf(parseArtefacts(text)))).toContain(
      "artefacts.2.id",
    );
  });

  it("rejects a copy artefact without versions", () => {
    const text = artefacts.replace('    mode: "link"\n', '    mode: "copy"\n');
    expect(errorOf(parseArtefacts(text)).kind).toBe("schema");
  });

  it("rejects an alias", () => {
    const text = artefacts.replace(
      'name: "PCA script"',
      'name: &s "PCA script"',
    );
    expectReason(errorOf(parseArtefacts(text)), "syntax", /anchor/i);
  });
});

describe("request.json", () => {
  it("rejects text that is not JSON", () => {
    expectReason(errorOf(parseRequest("{ not json")), "syntax", /JSON/i);
  });

  it("rejects a top-level array", () => {
    expect(errorOf(parseRequest("[]")).kind).toBe("schema");
  });

  it("reports a newer format version", () => {
    const text = request.replace('"format_version": 1', '"format_version": 3');
    expect(errorOf(parseRequest(text))).toMatchObject({
      kind: "unsupported-version",
      found: 3,
    });
  });

  it("rejects copy mode without a payload", () => {
    const text = request.replace(
      '"payload": "pca_by_treatment.pdf"',
      '"payload": null',
    );
    expect(schemaPaths(errorOf(parseRequest(text)))).toContain("payload");
  });

  it("accepts unknown keys", () => {
    const text = request.replace("{\n", '{\n  "x_future": true,\n');
    expect(parseRequest(text).ok).toBe(true);
  });
});

const experimentFrontmatter = [
  "---",
  'id: "01JAXQ8M3K7T2V9R4W6Y5Z0B1C"',
  'ref: "EXP-042"',
  'question: "01JAXA1C5D8E2F4G6H7J9K0M1N"',
  'title: "PCA of treatment and batch"',
  'status: "complete"',
  'created: "2026-09-02T08:30:00Z"',
  'updated: "2026-09-05T16:11:42Z"',
  "---",
  "",
].join("\n");

const withBody = (body: string): string =>
  `${experimentFrontmatter}\n${body}\n`;

describe("experiment.md frontmatter", () => {
  it("accepts the frontmatter used by the tests below", () => {
    expect(parseExperiment(withBody("## Methods\n\nA")).ok).toBe(true);
  });

  it("rejects a file that does not start with a fence", () => {
    expectReason(
      errorOf(parseExperiment("# Just notes\n")),
      "frontmatter",
      /opening/i,
    );
  });

  it("rejects a fence with trailing spaces", () => {
    const text = experimentFrontmatter.replace("---\n", "--- \n");
    expectReason(errorOf(parseExperiment(text)), "frontmatter", /opening/i);
  });

  it("rejects frontmatter that is never closed", () => {
    const text = experimentFrontmatter.slice(0, -"---\n".length);
    expectReason(errorOf(parseExperiment(text)), "frontmatter", /closing/i);
  });

  it("rejects an explicit null for an optional date", () => {
    const text = experimentFrontmatter.replace(
      'updated: "2026-09-05T16:11:42Z"\n',
      'updated: "2026-09-05T16:11:42Z"\nstarted: null\n',
    );
    expect(schemaPaths(errorOf(parseExperiment(text)))).toContain("started");
  });

  it("rejects a status outside the enum", () => {
    const text = experimentFrontmatter.replace('"complete"', '"finished"');
    expect(schemaPaths(errorOf(parseExperiment(text)))).toContain("status");
  });

  it("rejects an anchor in the frontmatter", () => {
    const text = experimentFrontmatter.replace('title: "PCA', 'title: &t "PCA');
    expectReason(errorOf(parseExperiment(text)), "syntax", /anchor/i);
  });
});

describe("experiment.md body", () => {
  it("rejects a recognised heading that appears twice", () => {
    const text = withBody(
      "## Methods\n\nA\n\n## Results notes\n\nB\n\n## Methods\n\nC",
    );
    expectReason(errorOf(parseExperiment(text)), "body", /more than once/i);
  });

  it("treats headings as the same regardless of case and padding", () => {
    const text = withBody("## Methods\n\nA\n\n##  METHODS  \n\nB");
    expectReason(errorOf(parseExperiment(text)), "body", /more than once/i);
  });

  it.each([
    [
      "text after the literature end marker",
      "<!-- literature:start -->\nx\n<!-- literature:end -->\n\nmore",
    ],
    ["a literature start without an end", "<!-- literature:start -->\nx"],
    ["a literature end without a start", "text\n<!-- literature:end -->"],
    [
      "a second literature block",
      "<!-- literature:start -->\na\n<!-- literature:end -->\n<!-- literature:start -->\nb\n<!-- literature:end -->",
    ],
    [
      "a start marker inside a literature block",
      "<!-- literature:start -->\n<!-- literature:start -->\n<!-- literature:end -->",
    ],
  ])("rejects %s", (_name, body) => {
    expectReason(
      errorOf(parseExperiment(withBody(body))),
      "body",
      /literature/i,
    );
  });

  it("allows blank lines after the literature end marker", () => {
    const text = withBody(
      "<!-- literature:start -->\nx\n<!-- literature:end -->\n\n\n",
    );
    expect(parseExperiment(text).ok).toBe(true);
  });
});

describe("question files", () => {
  it("rejects a missing fence", () => {
    expectReason(
      errorOf(parseQuestion("Just some text\n")),
      "frontmatter",
      /opening/i,
    );
  });

  it("rejects a ref with too few digits", () => {
    const text = readGolden("question.md").replace("Q-003", "Q-3");
    expect(schemaPaths(errorOf(parseQuestion(text)))).toContain("ref");
  });
});
