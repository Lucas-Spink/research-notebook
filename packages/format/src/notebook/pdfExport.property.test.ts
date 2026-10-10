import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  fixedNow,
  machineProject,
  machineSample,
} from "../../test/machine-export-sample";
import { buildPdfExport } from "./pdfExport";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

const noControls = (text: string): boolean =>
  [...text].every((c) => {
    const code = c.charCodeAt(0);
    return code >= 0x20 && !(code >= 0x7f && code <= 0x9f);
  });

/** Wording that would be markup if it were ever spliced into Typst source. */
const hostile = fc
  .oneof(
    fc.constantFrom(
      '#read("/etc/passwd")',
      "$1 + 1$",
      "#{ 1 + 1 }",
      "// comment",
      "\\#",
    ),
    fc.string({ minLength: 1, maxLength: 20 }),
  )
  .filter((text) => text.trim() !== "" && noControls(text));

describe("buildPdfExport (FR-ARC-06)", () => {
  it("is JSON for any title and note, and the title arrives exactly as written", () => {
    fc.assert(
      fc.property(hostile, hostile, (title, note) => {
        const files = buildPdfExport({
          arranged: machineSample(title, note),
          project: machineProject,
          appVersion: "0.2.0",
          bibliography: { entries: [note] },
          now: fixedNow,
        });
        const input = JSON.parse(files.input) as {
          experiments: Array<{ title: string }>;
        };
        expect(input.experiments[0]?.title).toBe(title);
        expect(files.notebookJson).not.toBe("");
      }),
      { numRuns },
    );
  });
});
