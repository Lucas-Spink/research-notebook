import {
  AUTHOR_DATE_STYLE,
  EN_US_LOCALE,
  NUMERIC_STYLE,
  renderLiterature,
} from "@research-notebook/citations";
import {
  citationContext,
  parseExperimentBody,
  type ExperimentBodyModel,
} from "@research-notebook/format";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

/**
 * S5-G03: the app's Literature and `pandoc --citeproc` (the README's recovery
 * command, spec 5.7) list the same sources in the same order with the same
 * text. Pandoc must be installed; a missing Pandoc fails the test rather than
 * skipping it.
 */

const SOURCES = [
  {
    id: "z:u:LOVE2222",
    type: "article-journal",
    title:
      "Moderated estimation of fold change and dispersion for RNA-seq data",
    "container-title": "Genome Biol.",
    author: [
      { family: "Love", given: "Michael I." },
      { family: "Huber", given: "Wolfgang" },
      { family: "Anders", given: "Simon" },
    ],
    issued: { "date-parts": [[2014]] },
  },
  {
    id: "z:u:SMIT2222",
    type: "book",
    title: "Widgets & Gadgets",
    author: [{ family: "Smith", given: "Jane" }],
    issued: { "date-parts": [[2020]] },
  },
  {
    id: "z:g4521:ABCD2345",
    type: "article-journal",
    title: "A study of things",
    "container-title": "Journal of Things",
    author: [{ family: "Adams", given: "Ann" }],
    issued: { "date-parts": [[2018]] },
  },
] as const;

const EXPERIMENTS: Record<string, string> = {
  "repeats and clusters across both sections": [
    "## Methods",
    "",
    "Counts were normalised [@z:u:SMIT2222], then modelled [@z:u:LOVE2222; @z:u:SMIT2222].",
    "",
    "## Interpretation",
    "",
    "As before [@z:g4521:ABCD2345] and again [@z:u:SMIT2222].",
  ].join("\n"),
  "prefix, locator, suppress-author and author-in-text": [
    "## Methods",
    "",
    "See [see @z:g4521:ABCD2345, fig. 2; -@z:u:LOVE2222, pp. 10-12].",
    "",
    "## Interpretation",
    "",
    "@z:u:SMIT2222 [p. 4] argued otherwise.",
  ].join("\n"),
  "nothing cited": "## Methods\n\nNo citations here.",
};

const STYLES = [
  ["numeric", NUMERIC_STYLE],
  ["author-date", AUTHOR_DATE_STYLE],
] as const;

const work = mkdtempSync(join(tmpdir(), "pandoc-citeproc-"));
afterAll(() => rmSync(work, { recursive: true, force: true }));

function pandocAvailable(): void {
  try {
    execFileSync("pandoc", ["--version"], { stdio: "ignore" });
  } catch {
    throw new Error("Pandoc is required for S5-G03 but was not found on PATH");
  }
}

/** Emphasis markers and line wrapping are presentation, not content. */
const normalise = (text: string) =>
  text.replace(/\*/g, "").replace(/\s+/g, " ").trim();

function bodyOf(markdown: string): ExperimentBodyModel {
  const parsed = parseExperimentBody(markdown);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

function pandocEntries(markdown: string, style: string): string[] {
  writeFileSync(join(work, "bib.json"), JSON.stringify(SOURCES));
  writeFileSync(join(work, "style.csl"), style);
  writeFileSync(
    join(work, "experiment.md"),
    `${markdown}\n\n# References\n\n::: {#refs}\n:::\n`,
  );
  const out = execFileSync(
    "pandoc",
    [
      "experiment.md",
      "--citeproc",
      "--bibliography",
      "bib.json",
      "--csl",
      "style.csl",
      "-t",
      "plain",
      "--wrap=none",
    ],
    { cwd: work, encoding: "utf8" },
  );
  const refs = out.split(/^References\s*$/m)[1] ?? "";
  return refs
    .split(/\n\s*\n/)
    .map(normalise)
    .filter((entry) => entry !== "");
}

describe("Pandoc agrees with the app (S5-G03)", () => {
  it("has Pandoc to compare with", pandocAvailable);

  for (const [styleName, style] of STYLES) {
    for (const [name, markdown] of Object.entries(EXPERIMENTS)) {
      it(`${styleName}: ${name}`, () => {
        const rendered = renderLiterature({
          clusters: citationContext(bodyOf(markdown)),
          items: SOURCES,
          styleXml: style,
          localeXml: EN_US_LOCALE,
        });
        if (!rendered.ok) throw new Error(rendered.error.message);
        expect(rendered.value.entries.map(normalise)).toEqual(
          pandocEntries(markdown, style),
        );
      });
    }
  }
});
