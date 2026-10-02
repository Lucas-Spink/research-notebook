import {
  setExperimentLiterature,
  type BibliographyItemModel,
  type ExperimentBodyModel,
} from "@research-notebook/format";
import {
  EN_US_LOCALE,
  NUMERIC_STYLE,
  renderLiterature,
  type LiteratureInput,
  type LiteratureResult,
} from "@research-notebook/citations";
import { describe, expect, it, vi } from "vitest";
import {
  citationBasis,
  memoiseRenderer,
  planLiterature,
  type LiteratureSetup,
} from "./literaturePlan";

const SMITH = "z:u:SMIT2222";
const LOVE = "z:u:LOVE2222";

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

const ITEMS = [
  source(SMITH, "Widgets", "Smith"),
  source(LOVE, "Gadgets", "Love"),
];

const direct = (input: LiteratureInput): Promise<LiteratureResult> =>
  Promise.resolve(renderLiterature(input));

function setup(over: Partial<LiteratureSetup> = {}): LiteratureSetup {
  return {
    render: direct,
    items: ITEMS,
    styleXml: NUMERIC_STYLE,
    localeXml: EN_US_LOCALE,
    ...over,
  };
}

function body(
  methods: string,
  interpretation: string,
  literature: string | null = null,
): ExperimentBodyModel {
  return {
    preamble: "",
    sections: [
      { key: "methods", body: methods },
      { key: "results_notes", body: "" },
      { key: "interpretation", body: interpretation },
    ],
    literature,
  };
}

describe("planLiterature (FR-CIT-09, FR-CIT-10)", () => {
  it("regenerates the block from the text as it will be saved", async () => {
    const plan = await planLiterature(
      setup(),
      body("", ""),
      "methods",
      `Used [@${SMITH}].`,
    );
    expect(plan).toMatchObject({ kind: "write" });
    expect(plan.kind === "write" && plan.literature).toBe(
      "## Literature\n\n1. Smith, P. Widgets. (2020).",
    );
  });

  it("numbers by first appearance across Methods then Interpretation", async () => {
    const plan = await planLiterature(
      setup(),
      body("", `then [@${LOVE}]`),
      "methods",
      `first [@${SMITH}]`,
    );
    const text = plan.kind === "write" ? plan.literature : "";
    expect(text.indexOf("1. Smith")).toBeGreaterThan(-1);
    expect(text.indexOf("2. Love")).toBeGreaterThan(-1);
  });

  it("asks nothing when the stored block is what the app last generated", async () => {
    const first = await planLiterature(
      setup(),
      body("", ""),
      "methods",
      `[@${SMITH}]`,
    );
    const generated = first.kind === "write" ? first.literature : "";
    const stored = body(`[@${SMITH}]`, "", generated);
    const plan = await planLiterature(
      setup(),
      stored,
      "methods",
      `[@${SMITH}] more`,
    );
    expect(plan.kind).toBe("write");
  });

  it("flags a block that was edited by hand, with what would replace it", async () => {
    const stored = body(`[@${SMITH}]`, "", "## Literature\n\n1. My own note.");
    const plan = await planLiterature(
      setup(),
      stored,
      "methods",
      `[@${SMITH}] x`,
    );
    expect(plan.kind).toBe("edited");
  });

  it("flags text typed into a block that should be empty", async () => {
    const plan = await planLiterature(
      setup(),
      body("", "", "something typed"),
      "methods",
      "text",
    );
    expect(plan.kind).toBe("edited");
  });

  it("writes an empty block when nothing is cited, leaving the format to skip a missing one", async () => {
    const plan = await planLiterature(
      setup(),
      body("", ""),
      "methods",
      "no cites",
    );
    expect(plan).toMatchObject({ kind: "write", literature: "" });
  });

  it("never reads Results notes", async () => {
    const stored: ExperimentBodyModel = {
      ...body("", ""),
      sections: [
        { key: "results_notes", body: `[@${LOVE}]` },
        { key: "methods", body: "" },
      ],
    };
    const plan = await planLiterature(setup(), stored, "methods", "x");
    expect(plan).toMatchObject({ kind: "write", literature: "" });
  });

  it("leaves the block alone when the text cannot be stored", async () => {
    const plan = await planLiterature(
      setup(),
      body("", ""),
      "methods",
      "## heading",
    );
    expect(plan.kind).toBe("none");
  });

  it("leaves the block alone when rendering fails", async () => {
    const plan = await planLiterature(
      setup({ styleXml: "<nope" }),
      body("", ""),
      "methods",
      `[@${SMITH}]`,
    );
    expect(plan.kind).toBe("none");
  });

  it("leaves the block alone when the renderer is unavailable", async () => {
    const render = () => Promise.reject(new Error("worker down"));
    const plan = await planLiterature(
      setup({ render }),
      body("", ""),
      "methods",
      `[@${SMITH}]`,
    );
    expect(plan.kind).toBe("none");
  });

  it("gives the same basis for the same citations and a different one otherwise", async () => {
    const a = await planLiterature(
      setup(),
      body("", ""),
      "methods",
      `[@${SMITH}]`,
    );
    const b = await planLiterature(
      setup(),
      body("", ""),
      "methods",
      `[@${SMITH}] same`,
    );
    const c = await planLiterature(
      setup(),
      body("", ""),
      "methods",
      `[@${LOVE}]`,
    );
    expect(
      a.kind === "write" && b.kind === "write" && a.basis === b.basis,
    ).toBe(true);
    expect(
      a.kind === "write" && c.kind === "write" && a.basis !== c.basis,
    ).toBe(true);
    expect(citationBasis(body(`[@${SMITH}]`, ""))).toBe(
      a.kind === "write" ? a.basis : "",
    );
  });

  it("does not change the stored body", async () => {
    const stored = Object.freeze(body(`[@${SMITH}]`, ""));
    await planLiterature(setup(), stored, "methods", "x");
    expect(stored.literature).toBeNull();
  });
});

describe("memoiseRenderer", () => {
  it("renders an identical request once", async () => {
    const render = vi.fn(direct);
    const memo = memoiseRenderer(render);
    const input = {
      clusters: [],
      items: ITEMS,
      styleXml: NUMERIC_STYLE,
      localeXml: EN_US_LOCALE,
    };
    await memo(input);
    await memo({ ...input });
    expect(render).toHaveBeenCalledTimes(1);
  });

  it("renders again when the style or the sources change", async () => {
    const render = vi.fn(direct);
    const memo = memoiseRenderer(render);
    const input = {
      clusters: [],
      items: ITEMS,
      styleXml: NUMERIC_STYLE,
      localeXml: EN_US_LOCALE,
    };
    await memo(input);
    await memo({ ...input, styleXml: `${NUMERIC_STYLE} ` });
    await memo({ ...input, items: [] });
    expect(render).toHaveBeenCalledTimes(3);
  });
});

describe("a block that setExperimentLiterature accepts", () => {
  it("is what the plan produces", async () => {
    const plan = await planLiterature(
      setup(),
      body("", ""),
      "methods",
      `[@${SMITH}]`,
    );
    expect(
      plan.kind === "write" &&
        setExperimentLiterature(body("", ""), plan.literature).ok,
    ).toBe(true);
  });
});
