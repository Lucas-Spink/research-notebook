// Generates the `large` fixture (spec 12.3: 500 experiments, 5,000
// artefacts) using packages/format's own operations, so it is canonical by
// construction. Run with `pnpm fixtures:generate`. The output is not
// committed (docs/testing-guide.md; see .gitignore) — S2-T13's agent notes:
// "Generate the large fixture by script; do not commit it."
import { URL } from "node:url";
import {
  buildNotebook,
  writeFixtureMarker,
  writeNotebook,
} from "./lib/build-notebook.mjs";

const QUESTION_COUNT = 20;
const EXPERIMENTS_PER_QUESTION = 25; // 20 * 25 = 500 experiments (spec 12.3)
const ARTEFACTS_PER_EXPERIMENT = 10; // 500 * 10 = 5,000 artefacts (spec 12.3)

const outDir = new URL(
  "../fixtures/projects/format-v1/large/",
  import.meta.url,
);

const built = buildNotebook({
  appVersion: "0.1.0",
  projectName: "Large generated project",
  questionCount: QUESTION_COUNT,
  experimentsPerQuestion: EXPERIMENTS_PER_QUESTION,
  artefactsPerExperiment: ARTEFACTS_PER_EXPERIMENT,
});
writeNotebook(outDir, built);
writeFixtureMarker(outDir, "large", true);

const artefactCount = [...built.artefactsByExperiment.values()].reduce(
  (sum, file) => sum + file.artefacts.length,
  0,
);
console.log(
  `Wrote ${built.state.questions.length} questions, ` +
    `${built.state.experiments.length} experiments and ` +
    `${artefactCount} artefacts to fixtures/projects/format-v1/large/ (not committed).`,
);
