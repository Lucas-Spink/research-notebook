import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  experimentFile,
  markdownText,
  trimBlankLines,
} from "../test/file-arbitraries";
import { PASSTHROUGH_BLOCKS } from "../test/passthrough";
import { setExperimentSection } from "./experiment-edit";
import { parseExperiment, serialiseExperiment } from "./files";
import { RECOGNISED_SECTIONS } from "./schema";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

/** Valid section text: generated Markdown mixed with unmodelled constructs. */
const sectionText = fc
  .array(fc.oneof(markdownText(), fc.constantFrom(...PASSTHROUGH_BLOCKS)), {
    maxLength: 3,
  })
  .map((parts) => trimBlankLines(parts.join("\n\n")));

const edit = fc.record({
  file: experimentFile(),
  key: fc.constantFrom(...RECOGNISED_SECTIONS),
  text: sectionText,
});

describe("preserve-unknown: editing one section", () => {
  it("changes only that section and keeps every unknown part", () => {
    fc.assert(
      fc.property(edit, ({ file, key, text }) => {
        const result = setExperimentSection(file.body, key, text);
        if (!result.ok) throw new Error(result.error.message);
        const after = result.value;

        expect(after.preamble).toBe(file.body.preamble);
        expect(after.literature).toBe(file.body.literature);
        expect(after.sections.filter((s) => s.key === "unknown")).toEqual(
          file.body.sections.filter((s) => s.key === "unknown"),
        );
        for (const other of RECOGNISED_SECTIONS) {
          if (other === key) continue;
          expect(after.sections.find((s) => s.key === other)).toEqual(
            file.body.sections.find((s) => s.key === other),
          );
        }
        expect(after.sections.find((s) => s.key === key)?.body).toBe(text);
      }),
      { numRuns },
    );
  });

  it("keeps the frontmatter, unknown keys included, through save and reload", () => {
    fc.assert(
      fc.property(edit, ({ file, key, text }) => {
        const result = setExperimentSection(file.body, key, text);
        if (!result.ok) throw new Error(result.error.message);
        const written = serialiseExperiment({ ...file, body: result.value });

        const reloaded = parseExperiment(written);
        if (!reloaded.ok) throw new Error(reloaded.error.message);
        expect(reloaded.value.frontmatter).toEqual(file.frontmatter);
        expect(reloaded.value.body).toEqual(result.value);
        expect(serialiseExperiment(reloaded.value)).toBe(written);
      }),
      { numRuns },
    );
  });

  it("is idempotent, and keeps the position of an existing section", () => {
    fc.assert(
      fc.property(edit, ({ file, key, text }) => {
        const once = setExperimentSection(file.body, key, text);
        if (!once.ok) throw new Error(once.error.message);
        const twice = setExperimentSection(once.value, key, text);
        expect(twice).toEqual(once);

        const existed = file.body.sections.findIndex((s) => s.key === key);
        if (existed !== -1) {
          expect(once.value.sections.findIndex((s) => s.key === key)).toBe(
            existed,
          );
        }
      }),
      { numRuns },
    );
  });
});
