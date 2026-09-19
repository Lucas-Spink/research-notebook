import { describe, expect, it } from "vitest";
import { PASSTHROUGH_BLOCKS } from "../test/passthrough";
import { readGolden } from "../test/golden";
import {
  setExperimentSection,
  type RecognisedSectionKey,
} from "./experiment-edit";
import {
  parseExperiment,
  parseQuestion,
  serialiseExperiment,
  serialiseQuestion,
  type ExperimentFile,
} from "./files";
import type { ExperimentBodyModel } from "./schema";

/**
 * Gate S2-G03: unknown frontmatter keys, preamble, unknown sections and
 * passthrough blocks are unchanged by an edit and save (spec 5.5, FR-EDT-02).
 * The edge-cases fixture arrives with S2-T13, so these tests use the
 * committed golden file and inline samples.
 */

const RECOGNISED_KEYS: readonly RecognisedSectionKey[] = [
  "methods",
  "results_notes",
  "interpretation",
];

function experimentFrom(text: string): ExperimentFile {
  const result = parseExperiment(text);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

function edited(
  file: ExperimentFile,
  key: RecognisedSectionKey,
  text: string,
): ExperimentFile {
  const result = setExperimentSection(file.body, key, text);
  if (!result.ok) throw new Error(result.error.message);
  return { ...file, body: result.value };
}

function sectionOrder(body: ExperimentBodyModel): string[] {
  return body.sections.map((section) =>
    section.key === "unknown" ? `unknown:${section.heading}` : section.key,
  );
}

function unknownSections(body: ExperimentBodyModel): unknown[] {
  return body.sections.filter((section) => section.key === "unknown");
}

const GOLDEN = "experiment-unknown-content.md";

describe("editing a recognised section of the unknown-content golden file", () => {
  it("changes only the edited section's bytes", () => {
    const before = readGolden(GOLDEN);
    const oldBlock =
      "## Methods\n\n```text\n## Results notes\n<!-- literature:start -->\n```\n\n" +
      "A fenced heading above is body text, not a section.\n\n";
    expect(before).toContain(oldBlock);

    const file = edited(
      experimentFrom(before),
      "methods",
      "Rewritten.\n\n| a | b |\n| - | - |\n| 1 | 2 |",
    );

    expect(serialiseExperiment(file)).toBe(
      before.replace(
        oldBlock,
        "## Methods\n\nRewritten.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n",
      ),
    );
  });

  it.each(RECOGNISED_KEYS)(
    "keeps the frontmatter, preamble, unknown sections and literature when %s is edited",
    (key) => {
      const original = experimentFrom(readGolden(GOLDEN));
      const saved = experimentFrom(
        serialiseExperiment(edited(original, key, "Replacement text.")),
      );

      expect(saved.frontmatter).toEqual(original.frontmatter);
      expect(saved.body.preamble).toBe(original.body.preamble);
      expect(unknownSections(saved.body)).toEqual(
        unknownSections(original.body),
      );
      expect(sectionOrder(saved.body)).toEqual(sectionOrder(original.body));
      expect(saved.body.literature).toBe(original.body.literature);
    },
  );

  it.each(RECOGNISED_KEYS)(
    "writes the original bytes when %s is set to the text it already has",
    (key) => {
      const text = readGolden(GOLDEN);
      const file = experimentFrom(text);
      const current = file.body.sections.find((s) => s.key === key);
      expect(current).toBeDefined();
      expect(serialiseExperiment(edited(file, key, current?.body ?? ""))).toBe(
        text,
      );
    },
  );

  it("does not modify the body it was given", () => {
    const file = experimentFrom(readGolden(GOLDEN));
    const snapshot = structuredClone(file.body);
    edited(file, "methods", "Changed.");
    edited(file, "results_notes", "");
    expect(file.body).toEqual(snapshot);
  });
});

describe("creating a missing recognised section", () => {
  const withSections = (headings: string[], literature = false): string =>
    [
      `---\nid: "01JAXQ9P2M6S1T8X3Z5A7C9E0G"\nref: "EXP-043"\n` +
        `question: "01JAXA1C5D8E2F4G6H7J9K0M1N"\ntitle: "T"\nstatus: "planned"\n` +
        `created: "2026-09-06T08:00:00Z"\nupdated: "2026-09-06T08:30:00Z"\n---`,
      ...headings.map((heading) => `## ${heading}\n\nText of ${heading}.`),
      ...(literature
        ? ["<!-- literature:start -->\nKept.\n<!-- literature:end -->"]
        : []),
    ].join("\n\n") + "\n";

  it("goes immediately after the nearest preceding recognised section", () => {
    const file = experimentFrom(
      withSections(["Methods", "Notes", "Interpretation"]),
    );
    expect(sectionOrder(edited(file, "results_notes", "New.").body)).toEqual([
      "methods",
      "results_notes",
      "unknown:Notes",
      "interpretation",
    ]);
  });

  it("goes immediately before the nearest following one when none precedes it", () => {
    const file = experimentFrom(withSections(["Notes", "Interpretation"]));
    expect(sectionOrder(edited(file, "methods", "New.").body)).toEqual([
      "unknown:Notes",
      "methods",
      "interpretation",
    ]);
  });

  it("goes after every other section and before the literature block when none is recognised", () => {
    const file = experimentFrom(withSections(["Notes", "Appendix"], true));
    const result = edited(file, "interpretation", "New.");
    expect(sectionOrder(result.body)).toEqual([
      "unknown:Notes",
      "unknown:Appendix",
      "interpretation",
    ]);
    expect(serialiseExperiment(result)).toBe(
      withSections(["Notes", "Appendix"]).slice(0, -1) +
        "\n\n## Interpretation\n\nNew.\n\n" +
        "<!-- literature:start -->\nKept.\n<!-- literature:end -->\n",
    );
  });

  it("creates the section empty when the new text is empty", () => {
    const file = experimentFrom(withSections(["Methods"]));
    expect(serialiseExperiment(edited(file, "interpretation", ""))).toBe(
      `${withSections(["Methods"])}\n## Interpretation\n`,
    );
  });

  it("uses canonical order relative to a stored order that is not canonical", () => {
    const file = experimentFrom(withSections(["Interpretation", "Methods"]));
    expect(sectionOrder(edited(file, "results_notes", "New.").body)).toEqual([
      "interpretation",
      "methods",
      "results_notes",
    ]);
  });
});

describe("section text that would break the body grammar", () => {
  const file = experimentFrom(readGolden(GOLDEN));
  const rejected: [string, string][] = [
    ["a level-2 heading", "Intro\n\n## Extra\n\nMore"],
    ["a recognised heading", "## Results notes\n\nDuplicate"],
    ["a literature start marker", "Text\n<!-- literature:start -->"],
    ["a literature end marker", "<!-- literature:end -->"],
    ["a fence that is never closed", "```python\nprint('x')"],
    ["a fence closed by a shorter fence", "````\ncode\n```"],
  ];

  it.each(rejected)("rejects %s and leaves the body alone", (_name, text) => {
    const snapshot = structuredClone(file.body);
    const result = setExperimentSection(file.body, "methods", text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("body");
    expect(file.body).toEqual(snapshot);
  });

  const accepted: [string, string][] = [
    [
      "a heading inside a fence",
      "```text\n## Extra\n<!-- literature:start -->\n```",
    ],
    ["a level-3 heading", "### Sub-heading"],
    ["an indented heading", "  ## Not a heading"],
    ["a heading with no space", "##Not a heading"],
  ];

  it.each(accepted)("accepts %s", (_name, text) => {
    const result = setExperimentSection(file.body, "methods", text);
    expect(result.ok).toBe(true);
    const saved = experimentFrom(
      serialiseExperiment(edited(file, "methods", text)),
    );
    expect(saved.body.sections.find((s) => s.key === "methods")?.body).toBe(
      text,
    );
  });
});

describe("normalising the text it is given", () => {
  const file = experimentFrom(readGolden(GOLDEN));

  it("turns CRLF into LF and drops blank lines at either end", () => {
    const result = edited(
      file,
      "methods",
      "\r\n\r\nline one\r\nline two  \r\n\r\n",
    );
    expect(result.body.sections.find((s) => s.key === "methods")?.body).toBe(
      "line one\nline two  ",
    );
  });
});

describe("passthrough blocks in section text", () => {
  const document = (methods: string): string =>
    `---\nid: "01JAXQ9P2M6S1T8X3Z5A7C9E0G"\nref: "EXP-043"\n` +
    `question: "01JAXA1C5D8E2F4G6H7J9K0M1N"\ntitle: "T"\nstatus: "planned"\n` +
    `created: "2026-09-06T08:00:00Z"\nupdated: "2026-09-06T08:30:00Z"\n---\n\n` +
    `Preamble.\n\n${methods === "" ? "## Methods" : `## Methods\n\n${methods}`}\n\n` +
    `## Notes\n\nUnknown.\n\n## Interpretation\n\nOriginal.\n`;

  it.each(PASSTHROUGH_BLOCKS)(
    "keeps %j through an edit of another section",
    (block) => {
      const text = document(`Before.\n\n${block}\n\nAfter.`);
      const file = experimentFrom(text);
      expect(serialiseExperiment(file)).toBe(text);

      const saved = serialiseExperiment(
        edited(file, "interpretation", "Changed."),
      );
      expect(saved).toBe(text.replace("Original.", "Changed."));
    },
  );

  it.each(PASSTHROUGH_BLOCKS)(
    "keeps %j when its own section gets more text",
    (block) => {
      const text = document(`Before.\n\n${block}`);
      const file = experimentFrom(text);
      const current = file.body.sections.find((s) => s.key === "methods");
      const saved = serialiseExperiment(
        edited(file, "methods", `${current?.body ?? ""}\n\nAppended.`),
      );
      expect(saved).toBe(document(`Before.\n\n${block}\n\nAppended.`));
    },
  );

  it.each(PASSTHROUGH_BLOCKS)(
    "keeps %j in the preamble and an unknown section",
    (block) => {
      // Function replacers: a block may contain "$$", which a string would expand.
      const text = document("Methods text.")
        .replace("Preamble.", () => `Preamble.\n\n${block}`)
        .replace("Unknown.", () => `Unknown.\n\n${block}`);
      const file = experimentFrom(text);
      const saved = serialiseExperiment(edited(file, "methods", "Changed."));
      expect(saved).toBe(text.replace("Methods text.", () => "Changed."));
    },
  );
});

const UNKNOWN_KEYS = {
  x_owner: "lab-notebook",
  x_tags: ["batch", "qc"],
  x_nested: {
    deep: {
      flag: true,
      none: null,
      count: 3,
      ratio: 1.5,
      text: "line one\nline two",
      lookalike: "true",
      date: "2026-01-01",
      unicode: "日本 é \u{1f600}",
    },
  },
  x_list_of_maps: [{ a: 1 }, { b: [] }],
  x_empty_map: {},
  x_empty_list: [],
};

describe("unknown frontmatter keys", () => {
  const known = {
    id: "01JAXQ9P2M6S1T8X3Z5A7C9E0G",
    ref: "EXP-043",
    question: "01JAXA1C5D8E2F4G6H7J9K0M1N",
    title: "Unknown keys",
    status: "running" as const,
    created: "2026-09-06T08:00:00Z",
    updated: "2026-09-06T08:30:00Z",
  };

  it("survive an experiment edit of a section and of a known field", () => {
    const start = experimentFrom(
      serialiseExperiment({
        frontmatter: { ...known, ...UNKNOWN_KEYS },
        body: { preamble: "Kept.", sections: [], literature: null },
      }),
    );
    const changed = edited(
      { ...start, frontmatter: { ...start.frontmatter, title: "New title" } },
      "methods",
      "Some methods.",
    );

    const text = serialiseExperiment(changed);
    const saved = experimentFrom(text);
    expect(saved.frontmatter).toEqual({
      ...known,
      title: "New title",
      ...UNKNOWN_KEYS,
    });
    expect(text.indexOf("updated:")).toBeLessThan(text.indexOf("x_owner:"));
    expect(serialiseExperiment(saved)).toBe(text);
  });

  it("survive a question edit", () => {
    const question = {
      id: "01JAXA1C5D8E2F4G6H7J9K0M1N",
      ref: "Q-001",
      title: "Question",
      created: "2026-09-01T09:00:00Z",
    };
    const start = parseQuestion(
      serialiseQuestion({
        frontmatter: { ...question, ...UNKNOWN_KEYS },
        body: "Motivation.\n\n| a | b |\n| - | - |\n| 1 | 2 |",
      }),
    );
    if (!start.ok) throw new Error(start.error.message);

    const text = serialiseQuestion({
      frontmatter: { ...start.value.frontmatter, title: "Renamed" },
      body: `${start.value.body}\n\nMore.`,
    });
    const saved = parseQuestion(text);
    if (!saved.ok) throw new Error(saved.error.message);
    expect(saved.value.frontmatter).toEqual({
      ...question,
      title: "Renamed",
      ...UNKNOWN_KEYS,
    });
    expect(saved.value.body).toBe(
      "Motivation.\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\nMore.",
    );
  });
});
