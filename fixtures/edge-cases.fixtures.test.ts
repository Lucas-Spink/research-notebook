import {
  editExperimentSection,
  parseExperiment,
  parseProject,
  parseQuestion,
  serialiseExperiment,
  serialiseQuestion,
  type NotebookState,
} from "../packages/format/src/index";
import { describe, expect, it } from "vitest";
import { must, openFixture } from "./support";

/**
 * Gate S2-G03 for the real `edge-cases` fixture (format-v1.md 3.2, 12.3):
 * Unicode names, CRLF, a BOM, unknown keys, passthrough Markdown, a detached
 * reference and a trashed source all parse, and unknown content survives an
 * edit and save. This complements, not replaces, the inline cases in
 * `packages/format/src/preserve-unknown.test.ts`.
 */

const fixture = openFixture("edge-cases");
const PROJECT = "_notebook/project.yaml";
const Q1 = "_notebook/questions/Q-001.md";
const Q2 = "_notebook/questions/Q-002.md";
const EXP1 = "_notebook/experiments/EXP-001/experiment.md";
const BIB = "_notebook/bibliography.json";

describe("edge-cases fixture: every file parses despite being hand-written", () => {
  it("is marked non-canonical, so S2-G01's byte-identical check does not apply to it", () => {
    expect(fixture.marker).toEqual({ kind: "edge-cases", canonical: false });
  });

  it("a project.yaml with a Unicode name and unknown keys at several levels parses", () => {
    const project = must(parseProject(fixture.read(PROJECT)));
    expect(project.name).toContain("日本語");
    expect(project).toMatchObject({
      x_generator: "handwritten for S2-T13",
      x_hint: {
        nested: "unknown keys survive at every level (format-v1.md 3.3)",
        numbers: [1, 2],
      },
    });
  });

  it("a question with Unicode text and an unknown key parses", () => {
    const question = must(parseQuestion(fixture.read(Q1)));
    expect(question.frontmatter.title).toContain("日本語");
    expect(question.frontmatter).toMatchObject({
      x_owner: "hand-written for S2-T13",
    });
    expect(question.body).toContain("café");
  });

  it("a question saved with CRLF is accepted, and becomes LF on the next write", () => {
    const text = fixture.read(Q2);
    expect(text.includes("\r\n")).toBe(true);
    const question = must(parseQuestion(text));
    const written = serialiseQuestion(question);
    expect(written.includes("\r")).toBe(false);
  });

  it("an experiment saved with a byte-order mark is accepted, and it is dropped on the next write", () => {
    const bytes = fixture.readBytes(EXP1);
    expect(bytes.subarray(0, 3)).toEqual(Buffer.from([0xef, 0xbb, 0xbf]));
    const experiment = must(parseExperiment(fixture.read(EXP1)));
    expect(serialiseExperiment(experiment).startsWith("﻿")).toBe(false);
  });

  it("an unknown frontmatter key on an experiment survives", () => {
    const experiment = must(parseExperiment(fixture.read(EXP1)));
    expect(experiment.frontmatter).toMatchObject({
      x_imported_from: "a tool that writes BOM and unknown keys",
    });
  });

  it("an unknown level-2 section, with its passthrough table and raw HTML, survives", () => {
    const experiment = must(parseExperiment(fixture.read(EXP1)));
    const notes = experiment.body.sections.find(
      (s) => s.key === "unknown" && s.heading === "Notes",
    );
    expect(notes).toBeDefined();
    expect(notes?.body).toContain("| Run | Batch | PC1");
    expect(notes?.body).toContain('<div class="note">');
  });

  it("a detached artefact reference (naming no artefact in this file) is preserved as plain text", () => {
    const experiment = must(parseExperiment(fixture.read(EXP1)));
    const methods = experiment.body.sections.find((s) => s.key === "methods");
    expect(methods?.body).toContain('"art:01JAX000000000000000000999"');
  });

  it("the literature block survives", () => {
    const experiment = must(parseExperiment(fixture.read(EXP1)));
    expect(experiment.body.literature).toContain("Love, M. I.");
  });

  it("a trashed bibliography source, and one with a null server_id, both parse", () => {
    const items = JSON.parse(fixture.read(BIB)) as unknown[];
    expect(Array.isArray(items)).toBe(true);
    // bibliography.json has no dedicated packages/format file parser export
    // beyond the schema itself; this fixture exists for Stage 5 to read.
    expect(items).toHaveLength(2);
  });
});

describe("edge-cases fixture: unknown content survives an edit and save (S2-G03)", () => {
  it("editing Results notes leaves the preamble, the unknown section and the literature block untouched", () => {
    const before = must(parseExperiment(fixture.read(EXP1)));
    const state: NotebookState = {
      project: must(parseProject(fixture.read(PROJECT))),
      questions: [],
      experiments: [{ folder: "EXP-001", file: before }],
      reservedRefs: [],
      unreadable: [],
    };
    const env = {
      now: () => new Date("2026-01-07T10:00:00Z"),
      newId: () => "unused",
      appVersion: "0.1.0",
    };
    const plan = must(
      editExperimentSection(
        state,
        before.frontmatter.id,
        "results_notes",
        "Edited results notes text.",
        env,
      ),
    );
    const written = plan.next.experiments[0]?.file;
    if (written === undefined)
      throw new Error("expected the edited experiment");
    expect(written.body.preamble).toBe(before.body.preamble);
    expect(
      written.body.sections.find(
        (s) => s.key === "unknown" && s.heading === "Notes",
      ),
    ).toEqual(
      before.body.sections.find(
        (s) => s.key === "unknown" && s.heading === "Notes",
      ),
    );
    expect(written.body.literature).toBe(before.body.literature);
    expect(written.frontmatter).toMatchObject({
      x_imported_from: "a tool that writes BOM and unknown keys",
    });

    const reparsed = must(parseExperiment(serialiseExperiment(written)));
    expect(reparsed).toEqual(written);
  });
});
