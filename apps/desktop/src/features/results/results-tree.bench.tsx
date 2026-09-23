import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { largeArtefacts } from "./model/sample";
import { ResultsTree } from "./ResultsTree";

// NFR-PERF-04 / S3-G11: the collapsed Results tree of an experiment with
// 2,000 artefacts renders in under 200 ms. Groups of 100 start collapsed
// (FR-GRP-06), and so does an Ungrouped area of 2,000. This measures React
// rendering to markup in Node, not layout or paint in the webview.
const THRESHOLD_MS = 200;
const grouped = largeArtefacts(2000, 20);
const ungrouped = { ...largeArtefacts(2000, 1), groups: [] };
const noop = () => Promise.resolve({ ok: true as const });

describe("results-tree", () => {
  test("2,000 artefacts in 20 collapsed groups", async ({ bench }) => {
    const result = await bench("render grouped", () => {
      renderToStaticMarkup(
        <ResultsTree file={grouped} disabled={false} onAction={noop} />,
      );
    }).run();
    expect(result.latency.mean).toBeLessThan(THRESHOLD_MS);
  });

  test("2,000 ungrouped artefacts, collapsed", async ({ bench }) => {
    const result = await bench("render ungrouped", () => {
      renderToStaticMarkup(
        <ResultsTree file={ungrouped} disabled={false} onAction={noop} />,
      );
    }).run();
    expect(result.latency.mean).toBeLessThan(THRESHOLD_MS);
  });
});
