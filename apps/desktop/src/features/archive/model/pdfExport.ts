import {
  buildPdfExport,
  projectCitationClusters,
  type Arranged,
  type CitationCluster,
  type PdfBibliography,
  type ProjectYamlModel,
  type Result,
} from "@research-notebook/format";
import type { commands } from "../../../ipc/bindings";

/** The commands the PDF export is made through; it writes `exports/pdf/project.pdf`. */
export type PdfExportApi = Pick<
  typeof commands,
  "appVersion" | "readNotebookFile" | "writePdfExport"
>;

/** What the person is told after the PDF was written. */
export type PdfExportOutcome = { written: true };

/** Why no PDF was written. Nothing is claimed in any case. */
export type PdfExportFailure =
  | "filesNotRead"
  | "bibliographyFailed"
  | "notBuilt"
  | "notWritable"
  | "writeFailed";

/**
 * Formats the sources cited anywhere in the project as one bibliography, with
 * a fresh citation context (FR-ARC-06). `null` when it could not be formatted.
 */
export type FormatBibliography = (
  clusters: readonly CitationCluster[],
) => Promise<PdfBibliography | null>;

type Input = {
  api: PdfExportApi;
  folder: number;
  arranged: Arranged;
  project: ProjectYamlModel;
  formatBibliography: FormatBibliography;
  now: () => Date;
};

const BIBLIOGRAPHY_PATH = "_notebook/bibliography.json";

/** The project's own `bibliography.json` text, or `[]` when it has none. */
async function readBibliography(
  api: PdfExportApi,
  folder: number,
): Promise<string | null> {
  const read = await api
    .readNotebookFile(folder, BIBLIOGRAPHY_PATH)
    .catch(() => null);
  if (read === null || read.status !== "ok") return null;
  return read.data.kind === "text" ? read.data.text : "[]\n";
}

/**
 * Writes the project PDF/A-3b (FR-ARC-06): the citations of the whole project
 * are formatted once, in one context, so sources are numbered afresh and listed
 * once; `packages/format` builds what the fixed template reads and the
 * `notebook.json` to embed; the project's `bibliography.json` is embedded as it
 * is stored. Nothing is written unless every part could be made.
 */
export async function exportPdf(
  input: Input,
): Promise<Result<PdfExportOutcome, PdfExportFailure>> {
  const version = await input.api.appVersion().catch(() => null);
  const bibliographyJson = await readBibliography(input.api, input.folder);
  if (version === null || bibliographyJson === null) {
    return { ok: false, error: "filesNotRead" };
  }
  const clusters = projectCitationClusters(input.arranged);
  const bibliography =
    clusters.length === 0
      ? { entries: [] }
      : await input.formatBibliography(clusters).catch(() => null);
  if (bibliography === null) return { ok: false, error: "bibliographyFailed" };

  const built = buildPdfExport({
    arranged: input.arranged,
    project: input.project,
    appVersion: version,
    bibliography,
    now: input.now,
  });
  const written = await input.api
    .writePdfExport(input.folder, {
      inputJson: built.input,
      notebookJson: built.notebookJson,
      bibliographyJson,
    })
    .catch(() => null);
  if (written === null) return { ok: false, error: "writeFailed" };
  if (written.status !== "ok") {
    return {
      ok: false,
      error:
        written.error.kind === "notWritable" ? "notWritable" : "writeFailed",
    };
  }
  switch (written.data) {
    case "written":
      return { ok: true, value: { written: true } };
    case "notBuilt":
      return { ok: false, error: "notBuilt" };
    case "writeFailed":
      return { ok: false, error: "writeFailed" };
  }
}
