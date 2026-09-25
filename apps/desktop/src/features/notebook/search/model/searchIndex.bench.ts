import { describe, expect, test } from "vitest";
import { largeProject } from "./searchFixtures";
import { buildSearchIndex, searchNotebook } from "./searchIndex";

// S4-G06: search is under 200 ms on a large project (500 experiments, 5,000
// artefacts, the same shape as fixtures/projects/format-v1/large). Coverage
// of every section type at this scale is asserted in searchIndex.test.ts;
// this file only measures speed. Building the index is measured separately
// from searching it: the index is built once when search opens, then
// searched again on every keystroke.
const THRESHOLD_MS = 200;
const { arranged, artefactsByFolder } = largeProject();

describe("searchNotebook: large project (S4-G06)", () => {
  test("builds the index", async ({ bench }) => {
    const result = await bench("buildSearchIndex", () => {
      buildSearchIndex(arranged, artefactsByFolder);
    }).run();
    expect(result.latency.mean).toBeLessThan(THRESHOLD_MS);
  });

  test("searches a common word", async ({ bench }) => {
    const index = buildSearchIndex(arranged, artefactsByFolder);
    const result = await bench("searchNotebook", () => {
      searchNotebook(index, "xenonflux");
    }).run();
    expect(result.latency.mean).toBeLessThan(THRESHOLD_MS);
  });
});
