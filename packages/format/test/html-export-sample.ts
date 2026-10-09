import { ArtefactsFile } from "../src/schema";
import type { Arranged } from "../src/notebook/arrange";
import type { ExportAsset } from "../src/notebook/htmlExport";
import { arrangedFrom, loadedExperiment } from "./notebook-support";
import { artefactsSample, hex64 } from "./samples";

/** One experiment with a script, PDFs, an image, a table, an SVG and a linked file, for the HTML export tests. */
const IMAGE_ID = "01JAXR1A1A1A1A1A1A1A1A1A1A";
const TABLE_ID = "01JAXR2B2B2B2B2B2B2B2B2B2B";
const SVG_ID = "01JAXR3C3C3C3C3C3C3C3C3C3C";

function copy(
  seed: string,
  id: string,
  name: string,
  type: string,
  files: string[],
): Record<string, unknown> {
  return {
    id,
    name,
    role: "result",
    mode: "copy",
    type,
    source: { root: "project", path: `results/${files[0] ?? "x"}` },
    created: "2026-09-03T14:02:11Z",
    versions: files.map((file, index) => ({
      v: index + 1,
      file: `evidence/${file}`,
      sha256: hex64(`${seed}${index}`),
      size: 100,
      captured: "2026-09-03T14:02:11Z",
    })),
  };
}

const base = artefactsSample as { artefacts: unknown[]; groups: unknown[] };
const artefacts = ArtefactsFile.parse({
  ...base,
  artefacts: [
    ...base.artefacts,
    copy("a1", IMAGE_ID, "Volcano plot", "image", [
      "volcano.png",
      "volcano.v2.png",
    ]),
    copy("b2", TABLE_ID, "Counts", "table", ["counts.csv"]),
    copy("c3", SVG_ID, "Diagram", "svg", ["diagram.svg"]),
  ],
});

export function exportSample(title = "PCA run", markdown = ""): Arranged {
  const arranged = arrangedFrom([
    loadedExperiment("EXP-001", "EXP-001", "Q1", { methods: markdown }),
  ]);
  const [item] = arranged.unassigned;
  if (item === undefined) throw new Error("fixture");
  item.experiment.file.frontmatter.title = title;
  item.artefacts = { kind: "file", file: structuredClone(artefacts) };
  return arranged;
}

export const IMAGE_V2 = "_notebook/experiments/EXP-001/evidence/volcano.v2.png";
export const TABLE_V1 = "_notebook/experiments/EXP-001/evidence/counts.csv";

export function exportAssets(): Map<string, ExportAsset> {
  return new Map<string, ExportAsset>([
    [
      IMAGE_V2,
      { kind: "image", src: "assets/abc-800.png", width: 800, height: 600 },
    ],
    [
      TABLE_V1,
      {
        kind: "table",
        header: ["gene", "count"],
        rows: [["A<1>", "5"]],
        moreRows: true,
        moreColumns: false,
        totalRows: null,
      },
    ],
  ]);
}
