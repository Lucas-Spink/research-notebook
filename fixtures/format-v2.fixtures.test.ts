import {
  FORMAT_VERSION,
  parseArtefacts,
  parseCanvas,
  parseExperiment,
  parseProject,
  parseQuestion,
  serialiseCanvas,
} from "../packages/format/src/index";
import { describe, expect, it } from "vitest";
import { listFixtures, must, openFixture } from "./support";

/**
 * ADR-0064, spec 5.13 rule 6: every released format version has fixtures.
 * Version 1 fixtures are immutable, so they are migrated on a temporary copy
 * before they are opened, as the application does; version 2 adds canvases.
 */

const olderFixtures = ["minimal", "typical", "edge-cases", "malformed"];

describe("version 1 fixtures migrate to the current format", () => {
  it.each(olderFixtures)(
    "%s: only the format_version line of project.yaml and artefacts.yaml changes",
    (name) => {
      const fixture = openFixture(name);
      const files = ["_notebook/project.yaml", ...fixture.artefactsFiles()];
      for (const relative of files) {
        const before = fixture.readSource(relative);
        const after = fixture.read(relative);
        expect(after, relative).toBe(
          before.replace(
            new RegExp("^(\\uFEFF?)format_version: 1(?=\\r?$)", "m"),
            "$1format_version: 2",
          ),
        );
      }
    },
  );

  it.each(olderFixtures)("%s: project.yaml is the current version", (name) => {
    const fixture = openFixture(name);
    const project = must(parseProject(fixture.read("_notebook/project.yaml")));
    expect(project.format_version).toBe(FORMAT_VERSION);
  });

  it.each(olderFixtures.filter((name) => name !== "malformed"))(
    "%s: every artefacts.yaml parses once migrated",
    (name) => {
      const fixture = openFixture(name);
      for (const relative of fixture.artefactsFiles()) {
        must(parseArtefacts(fixture.read(relative)));
      }
    },
  );

  it("never changes the committed folder: a second copy migrates the same way", () => {
    const first = openFixture("typical").read("_notebook/project.yaml");
    const second = openFixture("typical").read("_notebook/project.yaml");
    expect(second).toBe(first);
    expect(
      openFixture("typical").readSource("_notebook/project.yaml"),
    ).toContain("format_version: 1");
  });
});

describe("canvases fixture (format version 2)", () => {
  const fixture = openFixture("canvases");

  it("is listed with the other fixtures", () => {
    expect(listFixtures()).toContain("canvases");
  });

  it("has two canvases and nothing was migrated", () => {
    expect(fixture.canvasFiles()).toHaveLength(2);
    expect(fixture.read("_notebook/project.yaml")).toBe(
      fixture.readSource("_notebook/project.yaml"),
    );
  });

  it("round-trips every canvas file byte for byte", () => {
    for (const relative of fixture.canvasFiles()) {
      const text = fixture.read(relative);
      expect(serialiseCanvas(must(parseCanvas(text))), relative).toBe(text);
    }
  });

  it("names each canvas file after its own id", () => {
    for (const relative of fixture.canvasFiles()) {
      const canvas = must(parseCanvas(fixture.read(relative)));
      expect(relative.endsWith(`/${canvas.id}.canvas.json`), relative).toBe(
        true,
      );
    }
  });

  it("pins results from experiments under different questions on one canvas", () => {
    const questionOf = new Map<string, string>();
    for (const relative of fixture.experimentFiles()) {
      const experiment = must(parseExperiment(fixture.read(relative)));
      questionOf.set(
        experiment.frontmatter.id,
        experiment.frontmatter.question ?? "",
      );
    }
    const canvases = fixture
      .canvasFiles()
      .map((relative) => must(parseCanvas(fixture.read(relative))));
    const questions = new Set(
      canvases
        .flatMap((canvas) => canvas.nodes)
        .flatMap((node) =>
          node.type === "artefact" && questionOf.has(node.experiment_id)
            ? [questionOf.get(node.experiment_id)]
            : [],
        ),
    );
    expect(questions.size).toBeGreaterThan(1);
  });

  it("references real artefact versions, apart from the one deliberately missing", () => {
    const known = new Map<string, Set<number> | null>();
    for (const relative of fixture.artefactsFiles()) {
      for (const artefact of must(parseArtefacts(fixture.read(relative)))
        .artefacts) {
        known.set(
          artefact.id,
          artefact.mode === "copy"
            ? new Set(artefact.versions.map((version) => version.v))
            : null,
        );
      }
    }
    const missing: string[] = [];
    for (const relative of fixture.canvasFiles()) {
      for (const node of must(parseCanvas(fixture.read(relative))).nodes) {
        if (node.type !== "artefact") continue;
        const versions = known.get(node.artefact_id);
        if (versions === undefined) missing.push(node.id);
        else if (versions === null) expect(node.version).toBeUndefined();
        else expect(versions.has(node.version ?? -1)).toBe(true);
      }
    }
    expect(missing).toHaveLength(1);
  });

  it("round-trips its questions, experiments and artefacts like any version 2 project", () => {
    for (const relative of fixture.questionFiles()) {
      must(parseQuestion(fixture.read(relative)));
    }
    for (const relative of fixture.experimentFiles()) {
      must(parseExperiment(fixture.read(relative)));
    }
  });
});
