import type { ArtefactModel, ProjectYamlModel } from "../schema";
import type { Arranged, ArrangedExperiment } from "./arrange";
import {
  exportCitationClusters,
  motivationKey,
  preambleKey,
  sectionCitations,
  sectionKey,
} from "./exportSections";
import type { CitationCursor } from "./exportCitations";
import { latestVersion, versionKey } from "./htmlArtefacts";
import { selectExported } from "./htmlExport";
import { buildMachineExport } from "./machineExport";
import {
  pdfBlocks,
  pdfInline,
  type PdfBlock,
  type PdfInline,
} from "./pdfBlocks";
import { SECTION_TITLES } from "./machineMarkdown";

/** The version of `pdf-input.json`, which the fixed Typst template reads. */
export const PDF_INPUT_SCHEMA_VERSION = 2;

/** The combined project bibliography, formatted by the citation engine (FR-ARC-06). */
export interface PdfBibliography {
  /** One formatted entry each, as Markdown, in the style's order. */
  entries: readonly string[];
  /**
   * The in-text form of each citation of `projectCitationClusters`, in that
   * order; `null` where a source could not be resolved. Without it, citations
   * are carried as written.
   */
  clusterTexts?: readonly (string | null)[];
}

export interface PdfExportInput {
  arranged: Arranged;
  project: ProjectYamlModel;
  /** The running application's version, recorded in the embedded `notebook.json`. */
  appVersion: string;
  /** Formatted over `projectCitationClusters`, as one fresh citation context. */
  bibliography: PdfBibliography;
  now: () => Date;
}

/** The two texts the Rust exporter needs besides `bibliography.json`. */
export interface PdfExportFiles {
  /** `pdf-input.json`: the project as the template reads it. */
  input: string;
  /** `notebook.json` as the machine-readable export writes it, to embed. */
  notebookJson: string;
  /** The captured images the input shows, for the filesystem helper to read (issue #102). */
  figures: PdfFigureRequest[];
}

/** A captured image the PDF should show: its id in the input, and where the file is. */
export interface PdfFigureRequest {
  id: string;
  /** Project-relative path of the newest captured version. */
  file: string;
}

interface PdfArtefact {
  name: string;
  lines: string[];
  /** The captured image to show with the artefact, if it is one. */
  figure: { id: string; caption: string } | null;
}

interface PdfExperiment {
  ref: string;
  title: string;
  status: string;
  question: string | null;
  started: string | null;
  completed: string | null;
  preamble: PdfBlock[];
  sections: Array<{ heading: string; blocks: PdfBlock[] }>;
  artefacts: PdfArtefact[];
  literature: PdfBlock[];
}

/**
 * Every citation the exports show, in the order they show them (Motivations,
 * then each experiment's sections, Results notes included). Formatting these
 * once, in one engine, gives the combined bibliography and the in-text
 * citations a fresh citation context: sources are numbered from 1 and appear
 * once however many experiments cite them, whatever the experiments' own
 * Literature blocks say.
 */
export function projectCitationClusters(arranged: Arranged) {
  return exportCitationClusters(selectExported(arranged));
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/u, "Z");
}

/** The stored Literature block without its heading and markers, which the PDF supplies. */
function literatureBody(block: string): string {
  return block
    .split("\n")
    .filter(
      (line) =>
        !/^<!--\s*literature:(?:start|end)\s*-->$/u.test(line.trim()) &&
        !/^##\s+literature\s*$/iu.test(line.trim()),
    )
    .join("\n");
}

/** Hands out `f1`, `f2`, ... across the whole project, and remembers what was asked for. */
interface Figures {
  next(file: string): string;
  requests: PdfFigureRequest[];
}

function newFigures(): Figures {
  const requests: PdfFigureRequest[] = [];
  return {
    requests,
    next(file) {
      const id = `f${requests.length + 1}`;
      requests.push({ id, file });
      return id;
    },
  };
}

/** The figure to show for an artefact: a captured image or SVG, newest version. */
function figureOf(
  artefact: ArtefactModel,
  folder: string,
  figures: Figures,
): PdfArtefact["figure"] {
  if (artefact.mode !== "copy") return null;
  if (artefact.type !== "image" && artefact.type !== "svg") return null;
  const latest = latestVersion(artefact);
  const id = figures.next(versionKey(folder, latest.file));
  return {
    id,
    caption: `${artefact.name} (${latest.file}, version ${latest.v})`,
  };
}

function artefactLines(artefact: ArtefactModel): string[] {
  const kind = `${artefact.type}, ${artefact.role}`;
  if (artefact.mode === "link") {
    return [
      kind,
      `Linked file, not copied into the notebook: ${artefact.source.path}`,
    ];
  }
  return [
    kind,
    ...artefact.versions.map(
      (v) =>
        `Version ${v.v}: ${v.file} (${v.size} bytes, captured ${v.captured}, SHA-256 ${v.sha256})`,
    ),
  ];
}

function experimentOf(
  item: ArrangedExperiment,
  questionRef: string | null,
  figures: Figures,
  cites: ((key: string) => CitationCursor) | undefined,
): PdfExperiment {
  const { frontmatter: f, body } = item.experiment.file;
  const artefacts =
    item.artefacts?.kind === "file"
      ? item.artefacts.file.artefacts.map((a) => ({
          name: a.name,
          lines: artefactLines(a),
          figure: figureOf(a, item.experiment.folder, figures),
        }))
      : item.artefacts?.kind === "unreadable"
        ? [
            {
              name: "Artefacts",
              lines: ["Artefacts could not be read, so none are listed here."],
              figure: null,
            },
          ]
        : [];
  return {
    ref: f.ref,
    title: f.title,
    status: f.status,
    question: questionRef,
    started: f.started ?? null,
    completed: f.completed ?? null,
    preamble: pdfBlocks(body.preamble, cites?.(preambleKey(f.ref))),
    sections: body.sections.map((s, index) => ({
      heading: s.key === "unknown" ? s.heading : SECTION_TITLES[s.key],
      blocks: pdfBlocks(s.body, cites?.(sectionKey(f.ref, index))),
    })),
    artefacts,
    literature:
      body.literature === null
        ? []
        : pdfBlocks(literatureBody(body.literature)),
  };
}

/**
 * Builds what the project PDF is made from (FR-ARC-06, ADR-0056): the data the
 * fixed Typst template reads, and the `notebook.json` it embeds. Pure: the
 * clock is the caller's, and it is read once, so the PDF's date, the input and
 * the embedded `notebook.json` agree. Which questions and experiments are
 * included is decided as in the other exports.
 */
export function buildPdfExport(input: PdfExportInput): PdfExportFiles {
  const instant = input.now();
  const fixed = (): Date => instant;
  const shown = selectExported(input.arranged);
  const questionOf = new Map<ArrangedExperiment, string>();
  for (const q of shown.questions) {
    for (const e of q.experiments) {
      questionOf.set(e, q.question.file.frontmatter.ref);
    }
  }
  const texts = input.bibliography.clusterTexts;
  const cites =
    texts === undefined ? undefined : sectionCitations(shown, texts);
  const notebook = buildMachineExport({
    arranged: input.arranged,
    project: input.project,
    appVersion: input.appVersion,
    now: fixed,
  }).find((file) => file.name === "notebook.json");
  const figures = newFigures();
  const data = {
    schemaVersion: PDF_INPUT_SCHEMA_VERSION,
    title: input.project.name,
    locale: input.project.locale,
    generated: timestamp(instant),
    questions: shown.questions.map((q) => ({
      ref: q.question.file.frontmatter.ref,
      title: q.question.file.frontmatter.title,
      motivation: pdfBlocks(
        q.question.file.body,
        cites?.(motivationKey(q.question.file.frontmatter.ref)),
      ),
    })),
    experiments: shown.experiments.map((e) =>
      experimentOf(e, questionOf.get(e) ?? null, figures, cites),
    ),
    bibliography: input.bibliography.entries.map((entry): PdfInline[] =>
      pdfInline(entry),
    ),
    notExported: shown.skipped,
  };
  return {
    input: `${JSON.stringify(data, null, 2)}\n`,
    notebookJson: notebook?.text ?? "",
    figures: figures.requests,
  };
}
