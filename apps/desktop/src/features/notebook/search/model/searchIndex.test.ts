import type { Arranged } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { buildSearchIndex, searchNotebook } from "./searchIndex";
import {
  artefact,
  artefactsFile,
  experiment,
  largeProject,
  oneQuestionOneExperiment,
  question,
} from "./searchFixtures";

describe("searchNotebook: FR-SRC-01 fields", () => {
  it("matches a question's title", () => {
    const { arranged } = oneQuestionOneExperiment();
    const index = buildSearchIndex(arranged, new Map());
    const results = searchNotebook(index, "latency");
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe("question");
    expect(results[0]?.hits).toEqual([
      { kind: "title", text: "Does caching change latency?" },
    ]);
  });

  it("matches a question's Motivation text as a snippet", () => {
    const { arranged } = oneQuestionOneExperiment();
    const index = buildSearchIndex(arranged, new Map());
    const results = searchNotebook(index, "background");
    const hit = results[0]?.hits[0];
    expect(hit?.kind).toBe("motivation");
    if (hit?.kind === "motivation") expect(hit.snippet).toContain("Background");
  });

  it("matches an experiment's title", () => {
    const { arranged } = oneQuestionOneExperiment();
    const index = buildSearchIndex(arranged, new Map());
    const results = searchNotebook(index, "baseline");
    const group = results.find((r) => r.kind === "experiment");
    expect(group?.hits).toEqual([{ kind: "title", text: "Baseline run" }]);
  });

  it("matches every recognised section type, with a snippet around the match", () => {
    const { arranged } = oneQuestionOneExperiment({
      methods: "We used a warm cache for every trial.",
      results_notes: "Latency dropped once the cache warmed up.",
      interpretation: "The cache explains most of the effect.",
    });
    const index = buildSearchIndex(arranged, new Map());
    const results = searchNotebook(index, "cache");
    const group = results.find((r) => r.kind === "experiment");
    const sections = (group?.hits ?? [])
      .filter((h) => h.kind === "section")
      .map((h) => (h.kind === "section" ? h.section : null));
    expect(sections.sort()).toEqual(
      ["interpretation", "methods", "results_notes"].sort(),
    );
    const methodsHit = group?.hits.find(
      (h) => h.kind === "section" && h.section === "methods",
    );
    expect(methodsHit?.kind === "section" && methodsHit.snippet).toContain(
      "cache",
    );
  });

  it("matches an artefact's display name and filename, once artefacts are supplied", () => {
    const { arranged, experiment: exp } = oneQuestionOneExperiment();
    const files = artefactsFile([
      artefact("Volcano plot", "out/volcano-plot.png"),
    ]);
    const index = buildSearchIndex(arranged, new Map([[exp.folder, files]]));

    const byName = searchNotebook(index, "volcano");
    expect(byName.find((r) => r.kind === "experiment")?.hits).toContainEqual({
      kind: "artefactName",
      text: "Volcano plot",
    });

    const byFilename = searchNotebook(index, "volcano-plot.png");
    expect(
      byFilename.find((r) => r.kind === "experiment")?.hits,
    ).toContainEqual({ kind: "artefactFilename", text: "volcano-plot.png" });
  });

  it("finds nothing for an artefact when its artefacts.yaml has not been supplied", () => {
    const { arranged } = oneQuestionOneExperiment();
    const index = buildSearchIndex(arranged, new Map());
    expect(searchNotebook(index, "volcano")).toEqual([]);
  });
});

describe("searchNotebook: matching rules", () => {
  it("is case-insensitive and matches whole-word prefixes", () => {
    const { arranged } = oneQuestionOneExperiment({
      methods: "Sequencing depth was capped.",
    });
    const index = buildSearchIndex(arranged, new Map());
    expect(searchNotebook(index, "SEQUENC")).not.toEqual([]);
    expect(searchNotebook(index, "equenc")).toEqual([]);
  });

  it("requires every query word to match, in any order", () => {
    const { arranged } = oneQuestionOneExperiment({
      interpretation: "The batch effect explains the signal.",
    });
    const index = buildSearchIndex(arranged, new Map());
    expect(searchNotebook(index, "signal batch")).not.toEqual([]);
    expect(searchNotebook(index, "signal missing")).toEqual([]);
  });

  it("returns nothing for a blank or whitespace-only query", () => {
    const { arranged } = oneQuestionOneExperiment();
    const index = buildSearchIndex(arranged, new Map());
    expect(searchNotebook(index, "")).toEqual([]);
    expect(searchNotebook(index, "   ")).toEqual([]);
  });
});

describe("searchNotebook: grouping (FR-SRC-02)", () => {
  it("groups every hit for one experiment together, and keeps question and experiment groups separate", () => {
    const q = question("Q-001", "A question", "");
    const exp = experiment(
      "EXP-001",
      "A trial run",
      {
        methods: "Looked for signal here.",
        interpretation: "Found the signal.",
      },
      q.file.frontmatter.id,
    );
    const arranged: Arranged = {
      questions: [
        {
          question: q,
          readOnly: false,
          experiments: [
            { experiment: exp, readOnly: false, absentFromOrder: false },
          ],
        },
      ],
      unassigned: [],
      problems: [],
    };
    const index = buildSearchIndex(arranged, new Map());
    const results = searchNotebook(index, "signal");
    expect(results).toHaveLength(1);
    const experimentGroup = results.find((r) => r.kind === "experiment");
    expect(experimentGroup?.hits).toHaveLength(2);
    expect(experimentGroup?.key).toBe(`experiment:${exp.folder}`);
  });

  it("keeps a question's own hits separate from its experiments'", () => {
    const q = question("Q-002", "A question about drift", "");
    const exp = experiment(
      "EXP-002",
      "A trial run",
      { methods: "Checked for drift too." },
      q.file.frontmatter.id,
    );
    const arranged: Arranged = {
      questions: [
        {
          question: q,
          readOnly: false,
          experiments: [
            { experiment: exp, readOnly: false, absentFromOrder: false },
          ],
        },
      ],
      unassigned: [],
      problems: [],
    };
    const index = buildSearchIndex(arranged, new Map());
    const results = searchNotebook(index, "drift");
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.kind).sort()).toEqual([
      "experiment",
      "question",
    ]);
  });

  it("includes unassigned experiments", () => {
    const exp = experiment("EXP-009", "Orphan run", {
      methods: "Orphaned trial.",
    });
    const arranged: Arranged = {
      questions: [],
      unassigned: [
        { experiment: exp, readOnly: false, absentFromOrder: false },
      ],
      problems: [],
    };
    const index = buildSearchIndex(arranged, new Map());
    const results = searchNotebook(index, "orphan");
    expect(results.map((r) => r.key)).toContain(`experiment:${exp.folder}`);
  });
});

describe("searchNotebook: large project (S4-G06 coverage)", () => {
  it("finds a match in every recognised section type across 500 experiments", () => {
    const { arranged, artefactsByFolder } = largeProject();
    const index = buildSearchIndex(arranged, artefactsByFolder);
    const results = searchNotebook(index, "xenonflux");
    const sections = new Set(
      results
        .flatMap((group) => group.hits)
        .filter((hit) => hit.kind === "section")
        .map((hit) => (hit.kind === "section" ? hit.section : null)),
    );
    expect(sections).toEqual(
      new Set(["methods", "results_notes", "interpretation"]),
    );
  });
});
