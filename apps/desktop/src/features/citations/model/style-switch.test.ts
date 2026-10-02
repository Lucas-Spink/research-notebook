import {
  AUTHOR_DATE_STYLE,
  EN_US_LOCALE,
  NUMERIC_STYLE,
  renderLiterature,
} from "@research-notebook/citations";
import {
  parseExperimentBody,
  serialiseExperimentBody,
  setExperimentLiterature,
  type BibliographyItemModel,
  type ExperimentBodyModel,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { sha256Hex } from "../../../shared/sha256";
import { planRegeneration, type LiteratureSetup } from "./literaturePlan";

/** S5-G02: changing the citation style changes the literature block and nothing else in the file. */

const SMITH = "z:u:SMIT2222";
const ADAMS = "z:u:ADAM2222";

function source(
  id: string,
  title: string,
  family: string,
): BibliographyItemModel {
  const [, library = "u", key = ""] = id.split(":");
  return {
    id,
    type: "book",
    title,
    author: [{ family, given: "Pat" }],
    issued: { "date-parts": [[2020]] },
    _zotero: {
      server_id: null,
      library,
      key,
      fetched: "2026-10-02T09:00:00Z",
      status: "ok",
    },
  };
}

const under = (styleXml: string): LiteratureSetup => ({
  render: (input) => Promise.resolve(renderLiterature(input)),
  items: [source(SMITH, "Widgets", "Smith"), source(ADAMS, "Gadgets", "Adams")],
  styleXml,
  localeXml: EN_US_LOCALE,
});

const FILE_BODY = [
  "Preamble kept as it is.",
  "",
  "## Methods",
  "",
  `Counted [@${SMITH}] twice, **bold**, and a table:`,
  "",
  "| a | b |",
  "| - | - |",
  `| 1 | [@${ADAMS}] |`,
  "",
  "## Results notes",
  "",
  "Plain notes.",
  "",
  "## Interpretation",
  "",
  `Agrees with @${ADAMS} [p. 4].`,
  "",
  "## Appendix",
  "",
  "An unknown section.",
].join("\n");

function parse(text: string): ExperimentBodyModel {
  const parsed = parseExperimentBody(text);
  if (!parsed.ok) throw new Error(parsed.error.message);
  return parsed.value;
}

const hash = (text: string) => sha256Hex(text);

function hashesOutsideBlock(body: ExperimentBodyModel): string[] {
  return [
    hash(body.preamble),
    ...body.sections.map((s) => hash(`${s.key}\n${s.body}`)),
  ];
}

async function switchStyle(
  from: LiteratureSetup,
  to: LiteratureSetup,
  body: ExperimentBodyModel,
) {
  const plan = await planRegeneration(to, body, from);
  if (plan.kind !== "write")
    throw new Error(`expected a write, got ${plan.kind}`);
  const next = setExperimentLiterature(body, plan.literature);
  if (!next.ok) throw new Error(next.error.message);
  // Through the file text, as the real save does.
  return parse(serialiseExperimentBody(next.value));
}

describe("switching citation style (FR-CIT-10)", () => {
  it("changes the literature block and no section text", async () => {
    const numeric = under(NUMERIC_STYLE);
    const authorDate = under(AUTHOR_DATE_STYLE);
    const first = await switchStyle(numeric, numeric, parse(FILE_BODY));
    const second = await switchStyle(numeric, authorDate, first);

    expect(second.literature).not.toBe(first.literature);
    expect(hashesOutsideBlock(second)).toEqual(hashesOutsideBlock(first));
    expect(hashesOutsideBlock(first)).toEqual(
      hashesOutsideBlock(parse(FILE_BODY)),
    );
  });

  it("gives the same block going back to the first style", async () => {
    const numeric = under(NUMERIC_STYLE);
    const authorDate = under(AUTHOR_DATE_STYLE);
    const first = await switchStyle(numeric, numeric, parse(FILE_BODY));
    const there = await switchStyle(numeric, authorDate, first);
    const back = await switchStyle(authorDate, numeric, there);
    expect(back.literature).toBe(first.literature);
  });

  it("does not take a style change for a hand edit when told what it was generated under", async () => {
    const numeric = under(NUMERIC_STYLE);
    const first = await switchStyle(numeric, numeric, parse(FILE_BODY));
    const plan = await planRegeneration(
      under(AUTHOR_DATE_STYLE),
      first,
      numeric,
    );
    expect(plan.kind).toBe("write");
  });

  it("does take a hand edit for one", async () => {
    const numeric = under(NUMERIC_STYLE);
    const first = await switchStyle(numeric, numeric, parse(FILE_BODY));
    const edited = { ...first, literature: "1. Rewritten by hand." };
    const plan = await planRegeneration(
      under(AUTHOR_DATE_STYLE),
      edited,
      numeric,
    );
    expect(plan.kind).toBe("edited");
  });

  it("counts citations in a table and a hand-written author-in-text form", async () => {
    const numeric = under(NUMERIC_STYLE);
    const first = await switchStyle(numeric, numeric, parse(FILE_BODY));
    expect(first.literature).toContain("Smith");
    expect(first.literature).toContain("Adams");
  });
});
