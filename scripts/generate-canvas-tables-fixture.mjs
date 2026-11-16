// Generates the `canvas-tables` fixture (canvas format version 3, ADR-0071)
// with packages/format's own serialisers, so it is canonical by construction.
// It is committed; run `node scripts/generate-canvas-tables-fixture.mjs` only
// to rebuild it after a deliberate change, and explain the diff in the pull
// request. The released `canvases` fixture is not touched (it is immutable).
//
// One question of two experiments. Two canvases are written: one holds a 2 by 2
// table of copy-mode and link-mode results (one cell empty, one pointing at a
// result that does not exist), and a note whose line ends at one cell; the
// other holds no table and so stays at version 2, which is what a writer does.
import { URL } from "node:url";
import {
  buildNotebook,
  writeFixtureMarker,
  writeNotebook,
} from "./lib/build-notebook.mjs";
import { mkdirSync, writeFileSync } from "node:fs";

const format = await import(
  new URL("../packages/format/src/index.ts", import.meta.url).href
);
const { parseArtefacts, parseCanvas, serialiseArtefacts, serialiseCanvas } =
  format;

const outDir = new URL(
  "../fixtures/projects/format-v2/canvas-tables/",
  import.meta.url,
);

const built = buildNotebook({
  appVersion: "0.1.0",
  projectName: "Project with canvas tables",
  questionCount: 1,
  experimentsPerQuestion: 2,
  artefactsPerExperiment: 3,
});

/** Makes the first and third artefact of each experiment copy-mode with two versions, so a version can be pinned. */
function withCopyArtefacts(file, folder) {
  const artefacts = file.artefacts.map((artefact, index) => {
    if (index === 1) return artefact;
    const { link, source, ...rest } = artefact;
    const extension = artefact.type === "image" ? "png" : "csv";
    const name = `result-${index + 1}`;
    return {
      ...rest,
      mode: "copy",
      source,
      versions: [1, 2].map((v) => ({
        v,
        file: `evidence/${name}${v === 1 ? "" : `.v${v}`}.${extension}`,
        sha256: link.sha256.replace(/.$/, String(v)),
        size: link.size + v,
        captured: link.checked,
      })),
    };
  });
  const next = { ...file, artefacts };
  if (!parseArtefacts(serialiseArtefacts(next)).ok) {
    throw new Error(`artefacts for ${folder} are not valid`);
  }
  return next;
}

for (const [folder, file] of built.artefactsByExperiment) {
  built.artefactsByExperiment.set(folder, withCopyArtefacts(file, folder));
}

const experiments = built.state.experiments;
const idOf = (index) => experiments[index].file.frontmatter.id;
const artefactOf = (index, which) =>
  built.artefactsByExperiment.get(experiments[index].folder).artefacts[which]
    .id;

const ids = {
  tables: "01JAXC0000000000000000TB01",
  plain: "01JAXC0000000000000000TB02",
  table: "01JAXC00000000000000000T01",
  note: "01JAXC00000000000000000N01",
  edge: "01JAXC00000000000000000E01",
  rows: ["01JAXC00000000000000000R01", "01JAXC00000000000000000R02"],
  columns: ["01JAXC00000000000000000C01", "01JAXC00000000000000000C02"],
  missingExperiment: "01JAXC000000000000000000X1",
  missingArtefact: "01JAXC000000000000000000X2",
};

const withTable = {
  format_version: 3,
  id: ids.tables,
  name: "Replicates by treatment",
  nodes: [
    {
      id: ids.table,
      type: "table",
      rows: [
        { id: ids.rows[0], label: "Replicate 1" },
        { id: ids.rows[1], label: "Replicate 2" },
      ],
      columns: [
        { id: ids.columns[0], label: "Control" },
        { id: ids.columns[1], label: "Treated" },
      ],
      cells: [
        {
          row: ids.rows[0],
          column: ids.columns[0],
          experiment_id: idOf(0),
          artefact_id: artefactOf(0, 0),
          version: 2,
          aspect: 1.5,
        },
        {
          row: ids.rows[0],
          column: ids.columns[1],
          experiment_id: idOf(0),
          artefact_id: artefactOf(0, 1),
        },
        {
          row: ids.rows[1],
          column: ids.columns[1],
          experiment_id: ids.missingExperiment,
          artefact_id: ids.missingArtefact,
          version: 1,
        },
      ],
      fit: "row",
      position: { x: 200, y: 160 },
      size: { width: 720, height: 460 },
    },
    {
      id: ids.note,
      type: "note",
      text: "Replicate 2, control is missing: rerun it.",
      position: { x: 1000, y: 200 },
      size: { width: 260, height: 120 },
    },
  ],
  edges: [
    {
      id: ids.edge,
      source: ids.note,
      target: ids.table,
      target_handle: "left",
      target_cell: { row: ids.rows[1], column: ids.columns[0] },
      label: "requires-investigation",
    },
  ],
  viewport: { x: -80, y: -60, zoom: 0.8 },
};

const plain = {
  format_version: 2,
  id: ids.plain,
  name: "Untitled canvas",
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

for (const canvas of [withTable, plain]) {
  const text = serialiseCanvas(canvas);
  const parsed = parseCanvas(text);
  if (!parsed.ok) {
    throw new Error(
      `canvas ${canvas.id} is not valid: ${parsed.error.message}`,
    );
  }
}

writeNotebook(outDir, built);
const canvases = new URL("_notebook/canvases/", outDir);
mkdirSync(canvases, { recursive: true });
for (const canvas of [withTable, plain]) {
  writeFileSync(
    new URL(`${canvas.id}.canvas.json`, canvases),
    serialiseCanvas(canvas),
    "utf8",
  );
}
writeFixtureMarker(outDir, "canvas-tables", true);
console.log("Wrote fixtures/projects/format-v2/canvas-tables/");
