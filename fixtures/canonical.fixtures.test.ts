import {
  parseArtefacts,
  parseExperiment,
  parseProject,
  parseQuestion,
  serialiseArtefacts,
  serialiseExperiment,
  serialiseProject,
  serialiseQuestion,
} from "../packages/format/src/index";
import { describe, expect, it } from "vitest";
import { listFixtures, must, openFixture, type CopiedFixture } from "./support";

/**
 * Gate S2-G01: `serialise(parse(file))` is byte-identical for every file the
 * application itself wrote (format-v1.md 3.2). `minimal`, `typical` and
 * `large` are generated with the application's own serialisers
 * (scripts/lib/build-notebook.ts), so this holds for every file in them, not
 * only a sample. `large` is not committed (docs/testing-guide.md); this
 * suite exercises it only when `pnpm fixtures:generate` has made it.
 */

function checkRoundTrip(fixture: CopiedFixture) {
  const projectText = fixture.read("_notebook/project.yaml");
  const project = must(parseProject(projectText));
  expect(serialiseProject(project)).toBe(projectText);

  for (const relative of fixture.questionFiles()) {
    const text = fixture.read(relative);
    const question = must(parseQuestion(text));
    expect(serialiseQuestion(question)).toBe(text);
  }

  for (const relative of fixture.experimentFiles()) {
    const text = fixture.read(relative);
    const experiment = must(parseExperiment(text));
    expect(serialiseExperiment(experiment)).toBe(text);
  }

  for (const relative of fixture.artefactsFiles()) {
    const text = fixture.read(relative);
    const artefacts = must(parseArtefacts(text));
    expect(serialiseArtefacts(artefacts)).toBe(text);
  }
}

const canonicalFixtures = listFixtures()
  .map(openFixture)
  .filter((fixture) => fixture.marker.canonical);

describe("canonical fixtures round-trip byte for byte (S2-G01)", () => {
  it.each(canonicalFixtures.map((f) => [f.name, f] as const))(
    "%s: serialise(parse(file)) equals file, for every file",
    (_name, fixture) => {
      checkRoundTrip(fixture);
    },
  );

  it("found the required canonical fixtures", () => {
    const names = canonicalFixtures.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(["minimal", "typical"]));
  });
});

describe("the large fixture, when generated (pnpm fixtures:generate)", () => {
  const large = canonicalFixtures.find((f) => f.name === "large");

  it.runIf(large !== undefined)(
    "has exactly 500 experiments and 5,000 artefacts (spec 12.3)",
    () => {
      if (large === undefined) return;
      expect(large.experimentFiles()).toHaveLength(500);
      const artefactCounts = large.artefactsFiles().map((relative) => {
        const parsed = must(parseArtefacts(large.read(relative)));
        return parsed.artefacts.length;
      });
      expect(artefactCounts.reduce((a, b) => a + b, 0)).toBe(5000);
    },
  );

  it.runIf(large === undefined)(
    "is not committed, so this run has nothing to check",
    () => {
      expect(large).toBeUndefined();
    },
  );
});
