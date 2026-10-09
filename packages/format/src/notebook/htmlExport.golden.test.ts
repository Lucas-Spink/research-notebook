import { describe, expect, it } from "vitest";
import { exportAssets, exportSample } from "../../test/html-export-sample";
import type { Arranged } from "./arrange";
import { renderHtmlExport } from "./htmlExport";

/**
 * The HTML structure of the export (S6-G02). The files in `__golden__/` are
 * changed only by `pnpm golden:update`, with the diff explained in the PR.
 */
function sample(): Arranged {
  const arranged = exportSample(
    "PCA run",
    'Samples were **grown** overnight, see [PCA](evidence/pca.pdf "art:01JAXR5D8K2M4N6P8Q0R2S4T6V v2") [@z:u:7XK2PQ9M, p. 4].\n\n- one\n- two',
  );
  const [item] = arranged.unassigned;
  if (item === undefined) throw new Error("fixture");
  return {
    ...arranged,
    unassigned: [],
    questions: [
      {
        readOnly: false,
        experiments: [item],
        question: {
          fileName: "Q-001.md",
          file: {
            frontmatter: {
              id: item.experiment.file.frontmatter.question,
              ref: "Q-001",
              title: "Why does it grow?",
              created: "2026-09-01T10:00:00Z",
            },
            body: "Because **yeast**.",
          },
        },
      },
    ],
  };
}

describe("export golden files (S6-G02)", () => {
  const pages = renderHtmlExport({
    arranged: sample(),
    projectName: "Yeast study",
    locale: "en-GB",
    assets: exportAssets(),
  });

  it("has the expected pages", () => {
    expect(pages.map((p) => p.name)).toEqual([
      "index.html",
      "Q-001.html",
      "EXP-001.html",
    ]);
  });

  for (const page of ["index", "Q-001", "EXP-001"]) {
    it(`renders ${page}.html`, async () => {
      const found = pages.find((p) => p.name === `${page}.html`);
      await expect(found?.html).toMatchFileSnapshot(
        `../__golden__/export-${page}.html`,
      );
    });
  }
});
