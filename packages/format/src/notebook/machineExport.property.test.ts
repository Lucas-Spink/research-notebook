import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  fixedNow,
  machineProject,
  machineSample,
} from "../../test/machine-export-sample";
import { NotebookJson } from "../schema";
import { buildMachineExport } from "./machineExport";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

const noControls = (text: string): boolean =>
  [...text].every((c) => {
    const code = c.charCodeAt(0);
    return code >= 0x20 && !(code >= 0x7f && code <= 0x9f);
  });

const wording = fc.string({ maxLength: 40 }).filter(noControls);

function build(title: string, note: string) {
  return buildMachineExport({
    arranged: machineSample(title, note),
    project: machineProject,
    appVersion: "0.2.0",
    now: fixedNow,
  });
}

describe("buildMachineExport (FR-ARC-07)", () => {
  it("is valid against its schema, keeps the wording exactly and is stable", () => {
    fc.assert(
      fc.property(
        wording.filter((t) => t.trim() !== ""),
        wording,
        (title, note) => {
          const files = build(title, note);
          const json = files.find((f) => f.name === "notebook.json");
          const parsed = NotebookJson.parse(JSON.parse(json?.text ?? ""));
          const [experiment] = parsed.experiments;
          expect(experiment?.title).toBe(title);
          expect(
            experiment?.sections.find((s) => s.key === "methods")?.markdown,
          ).toBe(note);
          expect(build(title, note)).toEqual(files);
        },
      ),
      { numRuns },
    );
  });

  it("only names files inside exports/machine/, with plain names", () => {
    for (const { name } of build("PCA run", "")) {
      expect(name).toMatch(
        /^(?:notebook\.json|schemas\/[a-z]+\.schema\.json|markdown\/(?:Q|EXP)-\d+\.md)$/u,
      );
    }
  });
});
