// Builds what the project PDF is made from, for a project folder on disk:
// `pdf-input.json`, the `notebook.json` to embed and the `bibliography.json`
// to embed (S6-T06, FR-ARC-06). Used by the nightly PDF/A job, which has no
// application to ask. packages/format does the parsing and the building and
// packages/citations does the formatting, exactly as the application does;
// this module only reads files (AGENTS.md rule 2). It writes nothing.
//
// Node runs the TypeScript sources directly (type stripping); the resolve
// hook below supplies the extensionless imports the sources use.
import { registerHooks } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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
const citations = await import(
  new URL("../../packages/citations/src/index.ts", import.meta.url).href
);

const {
  arrangeNotebook,
  buildPdfExport,
  parseArtefacts,
  parseBibliography,
  parseExperiment,
  parseProject,
  parseQuestion,
  projectCitationClusters,
} = format;
const { DEFAULT_STYLE_XML, EN_US_LOCALE, renderLiterature } = citations;

function read(path) {
  return readFileSync(path, "utf8");
}

function must(result, what) {
  if (!result.ok) {
    throw new Error(
      `${what} could not be parsed: ${JSON.stringify(result.error)}`,
    );
  }
  return result.value;
}

function names(directory, keep) {
  return readdirSync(directory, { withFileTypes: true })
    .filter(keep)
    .map((entry) => entry.name)
    .sort();
}

/** Reads and parses a project's notebook, failing loudly on anything unreadable. */
function loadState(notebook) {
  const project = must(
    parseProject(read(`${notebook}/project.yaml`)),
    "project.yaml",
  );
  const questions = names(
    `${notebook}/questions`,
    (e) => e.isFile() && e.name.endsWith(".md"),
  ).map((fileName) => ({
    fileName,
    file: must(
      parseQuestion(read(`${notebook}/questions/${fileName}`)),
      fileName,
    ),
  }));
  const experiments = [];
  const artefacts = {};
  for (const folder of names(`${notebook}/experiments`, (e) =>
    e.isDirectory(),
  )) {
    const base = `${notebook}/experiments/${folder}`;
    experiments.push({
      folder,
      file: must(
        parseExperiment(read(`${base}/experiment.md`)),
        `${folder}/experiment.md`,
      ),
    });
    if (existsSync(`${base}/artefacts.yaml`)) {
      artefacts[folder] = {
        kind: "file",
        file: must(
          parseArtefacts(read(`${base}/artefacts.yaml`)),
          `${folder}/artefacts.yaml`,
        ),
      };
    }
  }
  return {
    project,
    questions,
    experiments,
    reservedRefs: [],
    unreadable: [],
    artefacts,
  };
}

/**
 * The three texts the Rust exporter needs for the project in `projectDir`.
 * `now` is the clock the files are dated by.
 */
export function buildPdfFiles(projectDir, { now, appVersion = "0.0.0" }) {
  const notebook = `${projectDir}/_notebook`;
  const state = loadState(notebook);
  const arranged = arrangeNotebook(state);

  const bibliographyPath = `${notebook}/bibliography.json`;
  const bibliographyJson = existsSync(bibliographyPath)
    ? read(bibliographyPath)
    : "[]\n";
  const items = must(parseBibliography(bibliographyJson), "bibliography.json");

  const stylePath = `${notebook}/styles/${state.project.citation_style}`;
  const styleXml = existsSync(stylePath) ? read(stylePath) : DEFAULT_STYLE_XML;
  const rendered = renderLiterature({
    clusters: projectCitationClusters(arranged),
    items,
    styleXml,
    localeXml: EN_US_LOCALE,
  });
  if (!rendered.ok) {
    throw new Error(
      `the bibliography could not be formatted: ${rendered.error.message}`,
    );
  }

  const { input, notebookJson } = buildPdfExport({
    arranged,
    project: state.project,
    appVersion,
    bibliography: { entries: rendered.value.entries },
    now,
  });
  return { input, notebookJson, bibliographyJson };
}
