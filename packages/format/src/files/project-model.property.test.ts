import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { projectModel } from "../../test/file-arbitraries";
import { parseProject, serialiseProject } from "./project";

const numRuns = Number(process.env.FC_NUM_RUNS ?? 200);

/** Gate S2-G02: generated projects serialise and parse to deep-equal models. */
describe("project model round-trip", () => {
  it("parse(serialise(model)) deep-equals model", () => {
    fc.assert(
      fc.property(projectModel(), (model) => {
        const parsed = parseProject(serialiseProject(model));
        if (!parsed.ok) throw new Error(parsed.error.message);
        expect(parsed.value).toEqual(model);
      }),
      { numRuns },
    );
  });

  it("serialise is canonical: serialise(parse(text)) equals text", () => {
    fc.assert(
      fc.property(projectModel(), (model) => {
        const text = serialiseProject(model);
        const parsed = parseProject(text);
        if (!parsed.ok) throw new Error(parsed.error.message);
        expect(serialiseProject(parsed.value)).toBe(text);
      }),
      { numRuns },
    );
  });

  it("output is LF only, has no BOM and ends with exactly one newline", () => {
    fc.assert(
      fc.property(projectModel(), (model) => {
        const text = serialiseProject(model);
        expect(text.includes("\r")).toBe(false);
        expect(text.startsWith("\uFEFF")).toBe(false);
        expect(text.endsWith("\n")).toBe(true);
        expect(text.endsWith("\n\n")).toBe(false);
      }),
      { numRuns },
    );
  });
});
