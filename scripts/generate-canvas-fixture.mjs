// Generates the `canvases` fixture (format version 2, ADR-0064) with
// packages/format's own serialisers, so it is canonical by construction. It is
// committed; run `node scripts/generate-canvas-fixture.mjs` only to rebuild it
// after a deliberate change, and explain the diff in the pull request.
//
// The project has two questions of two experiments each. Two canvases are
// written: one that compares results from experiments under both questions,
// holds a note, a region and connectors, and pins one result that does not
// exist (so the missing-reference case is covered); and an empty one.
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
  "../fixtures/projects/format-v2/canvases/",
  import.meta.url,
);

const built = buildNotebook({
  appVersion: "0.1.0",
  projectName: "Project with canvases",
  questionCount: 2,
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
  canvas: "01JAXC0000000000000000CNV1",
  empty: "01JAXC0000000000000000CNV2",
  nodes: [1, 2, 3, 4, 5, 6].map((n) => `01JAXC00000000000000000N0${n}`),
  edges: [1, 2].map((n) => `01JAXC00000000000000000E0${n}`),
  missingExperiment: "01JAXC000000000000000000X1",
  missingArtefact: "01JAXC000000000000000000X2",
};

const card = (position) => ({ position, size: { width: 360, height: 260 } });

const comparison = {
  format_version: 2,
  id: ids.canvas,
  name: "Compare dose response across questions",
  nodes: [
    {
      id: ids.nodes[0],
      type: "artefact",
      experiment_id: idOf(0),
      artefact_id: artefactOf(0, 0),
      version: 2,
      ...card({ x: 240, y: 180 }),
    },
    {
      id: ids.nodes[1],
      type: "artefact",
      experiment_id: idOf(2),
      artefact_id: artefactOf(2, 0),
      version: 1,
      ...card({ x: 640, y: 180 }),
    },
    {
      id: ids.nodes[2],
      type: "artefact",
      experiment_id: idOf(1),
      artefact_id: artefactOf(1, 1),
      ...card({ x: 240, y: 520 }),
    },
    {
      id: ids.nodes[3],
      type: "artefact",
      experiment_id: ids.missingExperiment,
      artefact_id: ids.missingArtefact,
      version: 1,
      ...card({ x: 640, y: 520 }),
    },
    {
      id: ids.nodes[4],
      type: "note",
      text: "PC1 separates treatment in both questions.\nCheck the batch before trusting it.",
      position: { x: 1040, y: 180 },
      size: { width: 280, height: 140 },
    },
    {
      id: ids.nodes[5],
      type: "region",
      label: "Dose response",
      position: { x: 200, y: 140 },
      size: { width: 840, height: 680 },
    },
  ],
  edges: [
    {
      id: ids.edges[0],
      source: ids.nodes[0],
      target: ids.nodes[1],
      label: "supports",
    },
    { id: ids.edges[1], source: ids.nodes[1], target: ids.nodes[4] },
  ],
  viewport: { x: -120, y: -80, zoom: 0.75 },
};

const empty = {
  format_version: 2,
  id: ids.empty,
  name: "Untitled canvas",
  nodes: [],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
};

for (const canvas of [comparison, empty]) {
  if (!parseCanvas(serialiseCanvas(canvas)).ok) {
    throw new Error(`canvas ${canvas.id} is not valid`);
  }
}

writeNotebook(outDir, built);
const canvases = new URL("_notebook/canvases/", outDir);
mkdirSync(canvases, { recursive: true });
for (const canvas of [comparison, empty]) {
  writeFileSync(
    new URL(`${canvas.id}.canvas.json`, canvases),
    serialiseCanvas(canvas),
    "utf8",
  );
}
writeFixtureMarker(outDir, "canvases", true);
console.log("Wrote fixtures/projects/format-v2/canvases/");
