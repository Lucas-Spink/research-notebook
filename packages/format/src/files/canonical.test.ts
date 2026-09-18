import { describe, expect, it } from "vitest";
import { z } from "zod";
import { readGolden } from "../../test/golden";
import type { Result } from "../result";
import { parseArtefacts, serialiseArtefacts } from "./artefacts";
import { parseExperiment, serialiseExperiment } from "./experiment";
import { parseProject, serialiseProject } from "./project";
import { parseQuestion, serialiseQuestion } from "./question";
import { parseRequest, serialiseRequest } from "./request";

/**
 * Files written by other tools or by hand need not be canonical, but they
 * must become canonical the next time the application writes them
 * (format-v1.md 3.2).
 */

function canonicalise<T>(
  text: string,
  parse: (text: string) => Result<T>,
  serialise: (value: T) => string,
): string {
  const parsed = parse(text);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return serialise(parsed.value);
}

describe("project.yaml written by hand", () => {
  const handWritten = `# my project
locale: 'en-GB'
format_version: 1
name: 'Batch effects in treated organoids'
id: 01JAX9Q2B7N4M8T6V3W5Y1Z0KC
created: 2026-09-01T09:12:44Z
last_written_by: 0.1.0
archived: ~
citation_style: nature.csl
numbering:
    next_experiment: 43
    next_question: 4
capture:
  evidence_in_git: false
  copy_threshold_mb: 100
order:
- question: 01JAXA1C5D8E2F4G6H7J9K0M1N
  experiments: [01JAXQ8M3K7T2V9R4W6Y5Z0B1C, 01JAXQ9P2M6S1T8X3Z5A7C9E0G]
table:
  collapsed_questions: []
  columns:
    - key: motivation
      width: 220
      hidden: false
    - {hidden: false, key: methods, width: 260}
    - {key: results, width: 280, hidden: false}
    - {key: results_notes, width: 300, hidden: false}
    - {key: interpretation, width: 320, hidden: false}
    - {key: literature, width: 240, hidden: false}
external_roots: []
`;

  it("becomes the canonical file: known key order, double quotes, flow columns", () => {
    expect(canonicalise(handWritten, parseProject, serialiseProject)).toBe(
      readGolden("project.yaml"),
    );
  });

  it("keeps unknown keys after the known keys of the same object, in their original order", () => {
    const text = readGolden("project.yaml")
      .replace(
        "format_version: 1\n",
        "format_version: 1\nx_second: 2\nx_first: 1\n",
      )
      .replace(
        "  evidence_in_git: false\n",
        "  x_inner: true\n  evidence_in_git: false\n",
      );
    const written = canonicalise(text, parseProject, serialiseProject);
    expect(written).toContain("external_roots: []\nx_second: 2\nx_first: 1\n");
    expect(written).toContain("  evidence_in_git: false\n  x_inner: true\n");
  });

  it("writes strings that look like other types as quoted strings", () => {
    const text = readGolden("project.yaml").replace(
      "external_roots: []\n",
      'external_roots: []\nx_a: "true"\nx_b: "null"\nx_c: "2026-01-01"\nx_d: "1.5"\n',
    );
    expect(canonicalise(text, parseProject, serialiseProject)).toBe(text);
  });
});

describe("experiment.md written by hand", () => {
  it("normalises heading case and padding, blank lines and line endings", () => {
    const handWritten = [
      "---",
      "title: PCA of treatment and batch",
      "id: 01JAXQ8M3K7T2V9R4W6Y5Z0B1C",
      "ref: EXP-042",
      "question: 01JAXA1C5D8E2F4G6H7J9K0M1N",
      "status: complete",
      "started: 2026-09-02",
      "completed: 2026-09-05",
      "created: 2026-09-02T08:30:00Z",
      "updated: 2026-09-05T16:11:42Z",
      "---",
      "",
      "",
      "##  methods  ",
      "PCA on variance-stabilised counts using DESeq2 [@z:u:7XK2PQ9M].",
      "",
      "",
      "",
      "## RESULTS NOTES",
      "",
      "Treatment groups separate along PC1.",
      "",
      "## Interpretation",
      "The PC1 separation is consistent with the treatment response reported previously [see @z:u:9HJ3LM2N, fig. 2].",
      "",
      "<!-- literature:start -->",
      "",
      "## Literature",
      "",
      "1. Love, M. I., Huber, W. & Anders, S. Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2. Genome Biol. 15, 550 (2014).",
      "",
      "<!-- literature:end -->",
      "",
      "",
    ].join("\r\n");
    expect(
      canonicalise(handWritten, parseExperiment, serialiseExperiment),
    ).toBe(readGolden("experiment.md"));
  });

  it("keeps whitespace inside a section, including trailing spaces that mean a hard break", () => {
    const text = readGolden("experiment.md").replace(
      "Treatment groups separate along PC1.",
      "First line  \n\n    indented code\n\nlast line",
    );
    expect(canonicalise(text, parseExperiment, serialiseExperiment)).toBe(text);
  });
});

describe("a question file written by hand", () => {
  it("gets one blank line after the frontmatter and none around the body", () => {
    const golden = readGolden("question.md");
    const handWritten = golden
      .replace("---\n\nEarlier", "---\nEarlier")
      .replace(/\n$/, "\n\n\n");
    expect(canonicalise(handWritten, parseQuestion, serialiseQuestion)).toBe(
      golden,
    );
  });

  it("keeps a --- line in the body", () => {
    const text = `${readGolden("question.md")}\n---\n\nAfter a rule.\n`;
    expect(canonicalise(text, parseQuestion, serialiseQuestion)).toBe(text);
  });

  it("writes an empty body as the closing fence and one newline", () => {
    const frontmatter = readGolden("question.md").split("\n---\n")[0];
    const text = `${frontmatter ?? ""}\n---\n`;
    expect(canonicalise(text, parseQuestion, serialiseQuestion)).toBe(text);
  });
});

describe("artefacts.yaml and request.json written by hand", () => {
  it("writes source as a flow map and known keys in order", () => {
    const handWritten = readGolden("artefacts.yaml")
      .replace(
        'source: {root: "project", path: "data/counts.h5"}',
        "source:\n      path: data/counts.h5\n      root: project",
      )
      .replaceAll('"', "'");
    expect(canonicalise(handWritten, parseArtefacts, serialiseArtefacts)).toBe(
      readGolden("artefacts.yaml"),
    );
  });

  it("writes compact, reordered JSON as the canonical layout", () => {
    const record = z
      .record(z.string(), z.unknown())
      .parse(JSON.parse(readGolden("request-copy.json")));
    const scrambled = JSON.stringify(
      Object.fromEntries(Object.entries(record).reverse()),
    );
    expect(canonicalise(scrambled, parseRequest, serialiseRequest)).toBe(
      readGolden("request-copy.json"),
    );
  });
});
