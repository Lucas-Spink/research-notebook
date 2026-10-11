import { describe, expect, it } from "vitest";
import { exportAssets, exportSample } from "../../test/html-export-sample";
import { hex64 } from "../../test/samples";
import {
  fixedNow,
  machineProject,
  machineSample,
} from "../../test/machine-export-sample";
import { ArtefactsFile } from "../schema";
import type { Arranged } from "./arrange";
import { renderHtmlExport } from "./htmlExport";
import { buildPdfExport } from "./pdfExport";

// Issue #104: a script copied into the project is a method artefact of type
// `script`. Neither export may leave it out, and neither runs it or embeds it.

const SCRIPT_ID = "01JAXR4D4D4D4D4D4D4D4D4D4D";
const NOTEBOOK_ID = "01JAXR5E5E5E5E5E5E5E5E5E5E";

function copiedMethod(
  id: string,
  seed: string,
  name: string,
  file: string,
  type = "script",
): Record<string, unknown> {
  return {
    id,
    name,
    role: "method",
    mode: "copy",
    type,
    source: { root: "project", path: `code/${file}` },
    created: "2026-09-03T14:02:11Z",
    versions: [
      {
        v: 1,
        file: `methods/${file}`,
        sha256: hex64(seed),
        size: 90_000_000,
        captured: "2026-09-03T14:02:11Z",
      },
    ],
  };
}

function withScripts(arranged: Arranged): Arranged {
  const [item] = [
    ...arranged.unassigned,
    ...arranged.questions.flatMap((q) => q.experiments),
  ];
  if (item === undefined || item.artefacts?.kind !== "file") {
    throw new Error("fixture");
  }
  const file = item.artefacts.file;
  item.artefacts.file = ArtefactsFile.parse({
    ...file,
    artefacts: [
      ...file.artefacts,
      copiedMethod(
        SCRIPT_ID,
        "d4",
        "mebocost_analysis",
        "mebocost_analysis.py",
      ),
      copiedMethod(
        NOTEBOOK_ID,
        "e5",
        "cell_communication",
        "cell_communication.ipynb",
        "notebook",
      ),
    ],
  });
  return arranged;
}

describe("scripts in the HTML export (issue #104)", () => {
  const pages = renderHtmlExport({
    arranged: withScripts(exportSample()),
    projectName: "Yeast study",
    locale: "en-GB",
    generated: "2026-10-11T14:30:05Z",
    assets: exportAssets(),
  });
  const html = pages.find((p) => p.name === "EXP-001.html")?.html ?? "";

  it("lists each script under the methods files, by name", () => {
    expect(html).toContain("Methods files");
    expect(html).toContain("mebocost_analysis");
    expect(html).toContain("cell_communication");
  });

  it("links the copied file so its contents can be reached", () => {
    expect(html).toContain("experiments/EXP-001/methods/mebocost_analysis.py");
    expect(html).toContain(
      "experiments/EXP-001/methods/cell_communication.ipynb",
    );
  });

  it("does not embed a script or run it", () => {
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<iframe");
  });
});

describe("scripts in the PDF export (issue #104)", () => {
  const arranged = withScripts(machineSample());
  const built = buildPdfExport({
    arranged,
    project: machineProject,
    appVersion: "0.2.0",
    bibliography: { entries: [] },
    now: fixedNow,
  });
  const input = JSON.parse(built.input) as {
    experiments: Array<{ artefacts: Array<{ name: string; lines: string[] }> }>;
  };
  const listed = input.experiments[0]?.artefacts ?? [];

  it("lists every script with its file name and type", () => {
    const script = listed.find((a) => a.name === "mebocost_analysis");
    expect(script?.lines.join("\n")).toContain("methods/mebocost_analysis.py");
    expect(script?.lines.join("\n")).toContain("script, method");
    const notebook = listed.find((a) => a.name === "cell_communication");
    expect(notebook?.lines.join("\n")).toContain(
      "methods/cell_communication.ipynb",
    );
  });

  it("lists scripts only: a large script is not embedded", () => {
    expect(built.input.length).toBeLessThan(200_000);
  });
});
