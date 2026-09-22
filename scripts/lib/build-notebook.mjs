// Shared by the fixture generators (S2-T13): builds a project's files using
// packages/format's own operations, so a generated fixture is canonical by
// construction and never hand-typed. packages/format does no I/O; this
// module and its callers own the writing, the same division as
// scripts/export-format-schemas.mjs.
//
// Node runs the TypeScript sources directly (type stripping); the resolve
// hook below supplies the extensionless imports packages/format's own
// sources use. Register it once, here, before importing packages/format, so
// every caller of this module gets it as a side effect of importing this file
// with its explicit .ts extension.
import { registerHooks } from "node:module";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { URL, fileURLToPath, pathToFileURL } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL?.startsWith("file:")) {
      const base = new URL(specifier, context.parentURL);
      for (const suffix of [".ts", "/index.ts"]) {
        const candidate = fileURLToPath(base) + suffix;
        if (existsSync(candidate)) {
          return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});

const format = await import(
  new URL("../../packages/format/src/index.ts", import.meta.url).href
);
const {
  createExperiment,
  createQuestion,
  editExperiment,
  editExperimentSection,
  newProject,
  serialiseArtefacts,
  serialiseExperiment,
  serialiseProject,
  serialiseQuestion,
} = format;

/** Crockford Base32, the ULID alphabet (format-v1.md `ulid`): no I, L, O or U. */
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * A deterministic clock and ULID source, so a generated fixture is
 * byte-identical between runs (testing-guide.md: "injected clocks and IDs").
 * Time advances one second per call, which also keeps every `created` and
 * `updated` distinct and in call order.
 */
function deterministicEnv(appVersion, startIso = "2026-01-06T09:00:00Z") {
  let seconds = Math.floor(new Date(startIso).getTime() / 1000);
  let count = 0;
  const now = () => new Date((seconds += 1) * 1000);
  const newId = () => {
    count += 1;
    let rest = count;
    let digits = "";
    while (rest > 0) {
      digits = CROCKFORD[rest % 32] + digits;
      rest = Math.floor(rest / 32);
    }
    return `01JAX${digits.padStart(21, "0")}`;
  };
  return { now, newId, appVersion };
}

/** Throws with the format's own message; a generator must never write an invalid fixture. */
function must(result) {
  if (!result.ok) {
    throw new Error(
      `fixture generation failed: ${JSON.stringify(result.error)}`,
    );
  }
  return result.ok ? result.value : undefined;
}

/**
 * Builds a project in memory: `questionCount` questions, `experimentsPerQuestion`
 * experiments in each (planned, then given a plausible status, dates and
 * section text), and `artefactsPerExperiment` fabricated link-mode artefacts
 * per experiment (no real files: nothing in the application reads
 * artefacts.yaml yet, ADR-0027).
 */
export function buildNotebook({
  appVersion,
  projectName,
  questionCount,
  experimentsPerQuestion,
  artefactsPerExperiment = 0,
}) {
  const env = deterministicEnv(appVersion);
  const created = must(newProject({ name: projectName, appVersion }, env));
  let state = {
    project: created.project,
    questions: [],
    experiments: [],
    reservedRefs: [],
    unreadable: [],
  };

  const STATUSES = ["planned", "running", "complete", "abandoned"];
  const artefactsByExperiment = new Map();

  for (let q = 0; q < questionCount; q += 1) {
    state = must(createQuestion(state, { title: questionTitle(q) }, env)).next;
    const question = state.questions.at(-1).file.frontmatter.id;

    for (let e = 0; e < experimentsPerQuestion; e += 1) {
      state = must(
        createExperiment(
          state,
          { questionId: question, title: experimentTitle(q, e) },
          env,
        ),
      ).next;
      const experiment = state.experiments.at(-1).file.frontmatter.id;
      const status = STATUSES[(q + e) % STATUSES.length];
      const changes = { status };
      if (status !== "planned") changes.started = isoDate(env.now());
      if (status === "complete" || status === "abandoned") {
        changes.completed = isoDate(env.now());
      }
      state = must(editExperiment(state, experiment, changes, env)).next;
      state = must(
        editExperimentSection(
          state,
          experiment,
          "methods",
          methodsText(q, e),
          env,
        ),
      ).next;
      state = must(
        editExperimentSection(
          state,
          experiment,
          "results_notes",
          resultsNotesText(q, e),
          env,
        ),
      ).next;
      state = must(
        editExperimentSection(
          state,
          experiment,
          "interpretation",
          interpretationText(q, e),
          env,
        ),
      ).next;

      if (artefactsPerExperiment > 0) {
        const folder = state.experiments.at(-1).folder;
        artefactsByExperiment.set(
          folder,
          fakeArtefacts(artefactsPerExperiment, env, folder),
        );
      }
    }
  }

  return { state, artefactsByExperiment };
}

function questionTitle(index) {
  const topics = [
    "batch effects",
    "treatment response",
    "dose dependence",
    "replicate consistency",
    "cross-platform agreement",
  ];
  const topic = topics[index % topics.length];
  return `Does ${topic} explain question ${index + 1}?`;
}

function experimentTitle(question, index) {
  return `Experiment ${index + 1} for question ${question + 1}`;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function methodsText(q, e) {
  return `PCA on variance-stabilised counts for question ${q + 1}, run ${e + 1}, using DESeq2 with default parameters.`;
}

function resultsNotesText(q, e) {
  return `Treatment groups for question ${q + 1} separate along PC1 in run ${e + 1}; batch is the dominant source of PC2 variance.`;
}

function interpretationText(q, e) {
  return `Consistent with the batch effect reported previously for question ${q + 1}; run ${e + 1} is worth a replicate at a higher dose.`;
}

/** `count` link-mode artefacts with fabricated but schema-valid hashes and no real files. */
function fakeArtefacts(count, env, folder) {
  const artefacts = [];
  for (let i = 0; i < count; i += 1) {
    const stamp = isoTimestamp(env.now());
    artefacts.push({
      id: fixedId(folder, i),
      name: `Result ${i + 1}`,
      role: "result",
      mode: "link",
      type: i % 2 === 0 ? "image" : "table",
      source: {
        root: "project",
        path: `results/${folder}/result-${i + 1}.png`,
      },
      created: stamp,
      link: {
        sha256: fakeHash(folder, i),
        size: 1024 * (i + 1),
        observed_mtime: stamp,
        checked: stamp,
      },
    });
  }
  return { format_version: 1, artefacts, groups: [] };
}

function isoTimestamp(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** A stable, valid-looking ULID derived from the folder and index, not the shared counter. */
function fixedId(folder, index) {
  const seed = `${folder}-${index}`;
  let hash = 0;
  for (const char of seed) hash = (hash * 31 + char.codePointAt(0)) >>> 0;
  let rest = hash;
  let digits = "";
  for (let i = 0; i < 21; i += 1) {
    digits = CROCKFORD[rest % 32] + digits;
    rest = Math.floor(rest / 32);
  }
  return `01JAX${digits}`;
}

/** A stable 64-hex-digit string derived from the folder and index (not a real hash of anything). */
function fakeHash(folder, index) {
  const seed = `${folder}:${index}`;
  let out = "";
  let hash = 2166136261;
  while (out.length < 64) {
    for (const char of seed + out.length) {
      hash = (hash ^ char.codePointAt(0)) >>> 0;
      hash = Math.imul(hash, 16777619) >>> 0;
    }
    out += hash.toString(16).padStart(8, "0");
  }
  return out.slice(0, 64);
}

/** Writes `state` (and, if given, each experiment's artefacts.yaml) to `outDir/_notebook/...`. */
export function writeNotebook(outDir, { state, artefactsByExperiment }) {
  const notebook = new URL("_notebook/", outDir);
  writeText(new URL("project.yaml", notebook), serialiseProject(state.project));
  writeText(new URL("bibliography.json", notebook), "[]\n");
  for (const question of state.questions) {
    writeText(
      new URL(`questions/${question.fileName}`, notebook),
      serialiseQuestion(question.file),
    );
  }
  for (const experiment of state.experiments) {
    writeText(
      new URL(`experiments/${experiment.folder}/experiment.md`, notebook),
      serialiseExperiment(experiment.file),
    );
    const artefacts = artefactsByExperiment?.get(experiment.folder) ?? {
      format_version: 1,
      artefacts: [],
      groups: [],
    };
    writeText(
      new URL(`experiments/${experiment.folder}/artefacts.yaml`, notebook),
      serialiseArtefacts(artefacts),
    );
  }
}

function writeText(url, text) {
  mkdirSync(new URL(".", url), { recursive: true });
  writeFileSync(url, text, "utf8");
}

/** Writes the fixture-harness marker (format-v1.md section 8 point 2, decided in S2-T13, ADR-0029). */
export function writeFixtureMarker(outDir, kind, canonical) {
  writeText(
    new URL("fixture.json", outDir),
    `${JSON.stringify({ kind, canonical }, null, 2)}\n`,
  );
}
