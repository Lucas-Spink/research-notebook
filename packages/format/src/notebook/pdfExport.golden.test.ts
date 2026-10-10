import { describe, expect, it } from "vitest";
import {
  fixedNow,
  machineProject,
  machineSample,
} from "../../test/machine-export-sample";
import { buildPdfExport } from "./pdfExport";

/**
 * What the PDF template reads (S6-G02). The file in `__golden__/` is changed
 * only by `pnpm golden:update`, with the diff explained in the PR.
 */
describe("export golden files (S6-G02)", () => {
  const files = buildPdfExport({
    arranged: machineSample(),
    project: machineProject,
    appVersion: "0.2.0",
    bibliography: {
      entries: ["1. Smith J. *A study of yeast*. 2020."],
    },
    now: fixedNow,
  });

  it("matches the PDF input", async () => {
    await expect(files.input).toMatchFileSnapshot(
      "../__golden__/export-pdf-input.json",
    );
  });

  it("embeds the notebook.json the machine-readable export writes", () => {
    expect(files.notebookJson).toContain('"schemaVersion": 1');
  });
});
