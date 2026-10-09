import { describe, expect, it } from "vitest";
import {
  fixedNow,
  machineProject,
  machineSample,
} from "../../test/machine-export-sample";
import { NotebookJson, renderJsonSchemaFiles } from "../schema";
import { buildMachineExport } from "./machineExport";
import { rewriteReferences } from "./machineMarkdown";

type Notebook = ReturnType<typeof NotebookJson.parse>;

function build(arranged = machineSample()) {
  return buildMachineExport({
    arranged,
    project: machineProject,
    appVersion: "0.2.0",
    now: fixedNow,
  });
}

function notebookOf(files: ReturnType<typeof build>): Notebook {
  const file = files.find((f) => f.name === "notebook.json");
  if (file === undefined) throw new Error("no notebook.json");
  return NotebookJson.parse(JSON.parse(file.text));
}

function textOf(name: string): string {
  return build().find((f) => f.name === name)?.text ?? "";
}

describe("buildMachineExport (FR-ARC-07)", () => {
  it("writes notebook.json last, after the schemas and renderings it names", () => {
    const names = build().map((f) => f.name);
    expect(names[names.length - 1]).toBe("notebook.json");
    expect(names).toContain("markdown/Q-001.md");
    expect(names).toContain("markdown/EXP-001.md");
  });

  it("produces a notebook.json that follows its own schema", () => {
    const notebook = notebookOf(build());
    expect(notebook.schemaVersion).toBe(1);
    expect(notebook.project.name).toBe(machineProject.name);
    expect(notebook.questions.map((q) => q.ref)).toEqual(["Q-001"]);
    expect(notebook.questions[0]?.experiments).toEqual(["EXP-001"]);
  });

  it("takes the time and application version it is given, to the second", () => {
    const notebook = notebookOf(build());
    expect(notebook.generatedAt).toBe("2026-10-09T12:00:00Z");
    expect(notebook.generatedBy).toBe("0.2.0");
  });

  it("is identical when built twice", () => {
    expect(build()).toEqual(build());
  });

  it("holds each experiment's sections, citekeys and every artefact version", () => {
    const [experiment] = notebookOf(build()).experiments;
    expect(experiment?.citekeys).toEqual(["z:u:7XK2PQ9M"]);
    expect(
      experiment?.sections.find((s) => s.key === "methods")?.markdown,
    ).toContain("**grown**");
    expect(experiment?.artefacts.state).toBe("read");
    const image = experiment?.artefacts.items.find(
      (a) => a.name === "Volcano plot",
    );
    expect(image?.versions.map((v) => v.file)).toEqual([
      "evidence/volcano.png",
      "evidence/volcano.v2.png",
    ]);
    expect(experiment?.artefacts.groups.length).toBeGreaterThan(0);
  });

  it("states that artefacts could not be read instead of listing none", () => {
    const arranged = machineSample();
    const item = arranged.questions[0]?.experiments[0];
    if (item === undefined) throw new Error("fixture");
    item.artefacts = { kind: "unreadable" };
    const [experiment] = notebookOf(build(arranged)).experiments;
    expect(experiment?.artefacts).toEqual({
      state: "unreadable",
      items: [],
      groups: [],
    });
  });

  it("names an experiment left out for sharing an ID instead of dropping it", () => {
    const arranged = machineSample();
    const item = arranged.questions[0]?.experiments[0];
    if (item === undefined) throw new Error("fixture");
    arranged.questions[0]?.experiments.push({ ...item, readOnly: true });
    const notebook = notebookOf(build(arranged));
    expect(notebook.experiments).toHaveLength(1);
    expect(notebook.notExported).toEqual(["EXP-001"]);
  });

  it("includes every notebook schema and the notebook.json schema", () => {
    const schemas = build()
      .filter((f) => f.name.startsWith("schemas/"))
      .map((f) => f.name.slice("schemas/".length));
    expect(schemas).toEqual([
      ...Object.keys(renderJsonSchemaFiles()),
      "notebook.schema.json",
    ]);
    expect(schemas).toContain("notebook.schema.json");
  });

  it("writes every section into the experiment's rendering with links to the originals", () => {
    const text = textOf("markdown/EXP-001.md");
    expect(text).toContain("# EXP-001 PCA run");
    expect(text).toContain("## Methods");
    expect(text).toContain("## Artefacts");
    expect(text).toContain(
      '[PCA](../../../experiments/EXP-001/evidence/pca_by_treatment.v2.pdf "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v2")',
    );
    expect(text).toContain(
      "../../../experiments/EXP-001/evidence/volcano.v2.png",
    );
  });

  it("leaves a reference it cannot resolve as it was written", () => {
    const text = '[x](a.pdf "art:01JAXR5D8K2M4N6P8Q0R2S4T6V")';
    expect(rewriteReferences(text, () => null)).toBe(text);
  });
});
