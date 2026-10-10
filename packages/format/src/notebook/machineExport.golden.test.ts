import { describe, expect, it } from "vitest";
import {
  fixedNow,
  machineProject,
  machineSample,
} from "../../test/machine-export-sample";
import { buildMachineExport } from "./machineExport";

/**
 * The machine-readable export (S6-G02). The files in `__golden__/` are changed
 * only by `pnpm golden:update`, with the diff explained in the PR.
 */
describe("export golden files (S6-G02)", () => {
  const files = buildMachineExport({
    arranged: machineSample(),
    project: machineProject,
    appVersion: "0.2.0",
    now: fixedNow,
  });
  const text = (name: string): string | undefined =>
    files.find((f) => f.name === name)?.text;

  it("matches notebook.json", async () => {
    await expect(text("notebook.json")).toMatchFileSnapshot(
      "../__golden__/export-notebook.json",
    );
  });

  for (const ref of ["Q-001", "EXP-001"]) {
    it(`matches the rendering of ${ref}`, async () => {
      await expect(text(`markdown/${ref}.md`)).toMatchFileSnapshot(
        `../__golden__/export-markdown-${ref}.md`,
      );
    });
  }

  it("matches the notebook.json schema", async () => {
    await expect(text("schemas/notebook.schema.json")).toMatchFileSnapshot(
      "../__golden__/export-notebook.schema.json",
    );
  });
});
