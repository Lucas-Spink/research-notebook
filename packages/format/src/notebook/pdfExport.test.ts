import { describe, expect, it } from "vitest";
import {
  fixedNow,
  machineProject,
  machineSample,
} from "../../test/machine-export-sample";
import { buildMachineExport } from "./machineExport";
import { buildPdfExport, projectCitationClusters } from "./pdfExport";

const bibliography = {
  entries: [
    "1. Smith J. *A study of yeast*. 2020.",
    "2. Jones K. Growth. 2021.",
  ],
};

function build(arranged = machineSample()) {
  return buildPdfExport({
    arranged,
    project: machineProject,
    appVersion: "0.2.0",
    bibliography,
    now: fixedNow,
  });
}

function inputOf(arranged = machineSample()): Record<string, unknown> {
  return JSON.parse(build(arranged).input) as Record<string, unknown>;
}

describe("projectCitationClusters (FR-ARC-06)", () => {
  it("joins every experiment's citations, in project order, as one context", () => {
    const arranged = machineSample("One", "First [@z:u:7XK2PQ9M].");
    const second = structuredClone(arranged.questions[0]?.experiments[0]);
    if (second === undefined) throw new Error("fixture");
    second.experiment.file.frontmatter.ref = "EXP-002";
    second.experiment.folder = "EXP-002";
    second.experiment.file.body.sections[0] = {
      key: "methods",
      body: "Then [@z:u:3HJ4MN8R] and [@z:u:7XK2PQ9M].",
    };
    arranged.questions[0]?.experiments.push(second);

    const keys = projectCitationClusters(arranged).flatMap((c) =>
      c.items.map((i) => i.citekey),
    );

    expect(keys).toEqual(["z:u:7XK2PQ9M", "z:u:3HJ4MN8R", "z:u:7XK2PQ9M"]);
  });

  it("leaves out an experiment the export leaves out", () => {
    const arranged = machineSample("One", "Cited [@z:u:7XK2PQ9M].");
    const item = arranged.questions[0]?.experiments[0];
    if (item === undefined) throw new Error("fixture");
    arranged.questions[0]?.experiments.push({ ...item, readOnly: true });

    expect(projectCitationClusters(arranged)).toHaveLength(1);
  });
});

describe("buildPdfExport (FR-ARC-06)", () => {
  it("embeds the same notebook.json the machine-readable export writes", () => {
    const written = buildMachineExport({
      arranged: machineSample(),
      project: machineProject,
      appVersion: "0.2.0",
      now: fixedNow,
    }).find((f) => f.name === "notebook.json");

    expect(build().notebookJson).toBe(written?.text);
  });

  it("dates the input by the clock it is given, to the second", () => {
    expect(inputOf().generated).toBe("2026-10-09T12:00:00Z");
    expect(inputOf().schemaVersion).toBe(1);
  });

  it("writes the questions, experiments, sections and artefacts the template reads", () => {
    const input = inputOf() as {
      title: string;
      questions: Array<{ ref: string; motivation: unknown[] }>;
      experiments: Array<{
        ref: string;
        question: string | null;
        sections: Array<{ heading: string; blocks: unknown[] }>;
        artefacts: Array<{ name: string; lines: string[] }>;
      }>;
    };
    expect(input.title).toBe(machineProject.name);
    expect(input.questions.map((q) => q.ref)).toEqual(["Q-001"]);
    const [experiment] = input.experiments;
    expect(experiment?.ref).toBe("EXP-001");
    expect(experiment?.question).toBe("Q-001");
    expect(experiment?.sections.map((s) => s.heading)).toEqual([
      "Methods",
      "Results notes",
      "Interpretation",
    ]);
    const plot = experiment?.artefacts.find((a) => a.name === "Volcano plot");
    expect(plot?.lines.join("\n")).toContain("evidence/volcano.v2.png");
  });

  it("carries the combined bibliography as formatted text", () => {
    const input = inputOf() as { bibliography: unknown[][] };
    expect(input.bibliography).toHaveLength(2);
    expect(JSON.stringify(input.bibliography[0])).toContain(
      '{"t":"em","c":[{"t":"text","s":"A study of yeast"}]}',
    );
  });

  it("names what it left out for sharing an ID", () => {
    const arranged = machineSample();
    const item = arranged.questions[0]?.experiments[0];
    if (item === undefined) throw new Error("fixture");
    arranged.questions[0]?.experiments.push({ ...item, readOnly: true });

    expect(
      (inputOf(arranged) as { notExported: string[] }).notExported,
    ).toEqual(["EXP-001"]);
  });

  it("is identical when built twice", () => {
    expect(build()).toEqual(build());
  });
});
