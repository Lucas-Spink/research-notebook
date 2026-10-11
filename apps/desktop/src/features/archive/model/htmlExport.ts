import {
  exportInstant,
  exportStamp,
  htmlAssetRequests,
  projectCitationClusters,
  renderHtmlExport,
  type Arranged,
  type ExportAsset,
  type Result,
} from "@research-notebook/format";
import type { commands, HtmlAssetOutcome } from "../../../ipc/bindings";
import type { FormatBibliography, FormattedCitations } from "./citations";

/** The two commands the HTML export is made through; both write under `exports/html/`. */
export type HtmlExportApi = Pick<
  typeof commands,
  "prepareHtmlAssets" | "writeHtmlPages"
>;

/** What the person is told after the export was written. */
export type HtmlExportOutcome = {
  /** Pages written, the index included. */
  pages: number;
  /** Pages that could not be written, by file name. Each is as it was before. */
  failedPages: readonly string[];
  /** Figures and tables that are only linked because they could not be prepared. */
  notPrepared: number;
  /** Citekeys cited but not in `bibliography.json`; the pages mark each citation of them. */
  unresolved: readonly string[];
  /** Where to open the export, relative to `_notebook/`: this run's own, dated, folder. */
  location: string;
};

/** Why no export was written. Nothing is claimed in either case. */
export type HtmlExportFailure =
  "filesNotPrepared" | "bibliographyFailed" | "notWritable" | "writeFailed";

type Input = {
  api: HtmlExportApi;
  folder: number;
  arranged: Arranged;
  projectName: string;
  locale: string;
  formatBibliography: FormatBibliography;
  /** The clock; read once, so the folder name and the date on every page agree. */
  now: () => Date;
};

/** Where one run's pages and reduced figures are written, which the pages refer to relative to themselves. */
const htmlFolder = (stamp: string): string =>
  `_notebook/exports/html/${stamp}/`;

function assetOf(outcome: HtmlAssetOutcome, folder: string): ExportAsset {
  switch (outcome.kind) {
    case "image":
      // A path outside the export folder is not one the pages should point at.
      return outcome.file.startsWith(folder)
        ? {
            kind: "image",
            src: outcome.file.slice(folder.length),
            width: outcome.width,
            height: outcome.height,
          }
        : { kind: "unavailable" };
    case "table":
      return {
        kind: "table",
        header: outcome.header,
        rows: outcome.rows,
        moreRows: outcome.moreRows,
        moreColumns: outcome.moreColumns,
        totalRows: outcome.totalRows,
      };
    case "unsupported":
      return { kind: "none" };
    case "missing":
    case "unavailable":
    case "writeFailed":
    case "refused":
      return { kind: "unavailable" };
  }
}

async function prepare(
  input: Input,
  stamp: string,
): Promise<Result<Map<string, ExportAsset>, HtmlExportFailure>> {
  const { api, folder, arranged } = input;
  const requests = htmlAssetRequests(arranged);
  const assets = new Map<string, ExportAsset>();
  if (requests.length === 0) return { ok: true, value: assets };
  const asked = await api
    .prepareHtmlAssets(
      folder,
      stamp,
      requests.map((r) => ({ file: r.path, sha256: r.sha256, kind: r.kind })),
    )
    .catch(() => null);
  if (asked === null) return { ok: false, error: "filesNotPrepared" };
  if (asked.status !== "ok") {
    return {
      ok: false,
      error: asked.error.kind === "notWritable" ? "notWritable" : "writeFailed",
    };
  }
  // An answer that does not account for every request would read as "the rest were fine".
  if (asked.data.length !== requests.length) {
    return { ok: false, error: "filesNotPrepared" };
  }
  requests.forEach((request, index) => {
    const outcome = asked.data[index];
    if (outcome !== undefined)
      assets.set(request.path, assetOf(outcome, htmlFolder(stamp)));
  });
  return { ok: true, value: assets };
}

const NO_CITATIONS: FormattedCitations = {
  entries: [],
  clusterTexts: [],
  unresolved: [],
};

/**
 * Formats the project's citations once, in the order the exports show them, so
 * the pages and the PDF word and number every citation alike (issue #102).
 */
async function formatCitations(
  input: Input,
): Promise<FormattedCitations | null> {
  const clusters = projectCitationClusters(input.arranged);
  if (clusters.length === 0) return NO_CITATIONS;
  return input.formatBibliography(clusters).catch(() => null);
}

/**
 * Writes the static HTML export (FR-ARC-05): asks the filesystem for reduced
 * figures and table samples, lets `packages/format` build the pages, and
 * stores them. The index is written last, so an interrupted run never leaves
 * a new index pointing at pages that are not there. A figure that could not be
 * prepared is reported and its page still links the original.
 */
export async function exportHtml(
  input: Input,
): Promise<Result<HtmlExportOutcome, HtmlExportFailure>> {
  const instant = input.now();
  const stamp = exportStamp(instant);
  const prepared = await prepare(input, stamp);
  if (!prepared.ok) return prepared;
  const citations = await formatCitations(input);
  if (citations === null) return { ok: false, error: "bibliographyFailed" };
  const rendered = renderHtmlExport({
    arranged: input.arranged,
    projectName: input.projectName,
    locale: input.locale,
    generated: exportInstant(instant),
    assets: prepared.value,
    citations: {
      texts: citations.clusterTexts,
      bibliography: citations.entries,
    },
  });
  const pages = [
    ...rendered.filter((p) => p.name !== "index.html"),
    ...rendered.filter((p) => p.name === "index.html"),
  ];
  const written = await input.api
    .writeHtmlPages(input.folder, stamp, pages)
    .catch(() => null);
  if (written === null) return { ok: false, error: "writeFailed" };
  if (written.status !== "ok") {
    return {
      ok: false,
      error:
        written.error.kind === "notWritable" ? "notWritable" : "writeFailed",
    };
  }
  if (written.data.length !== pages.length) {
    return { ok: false, error: "writeFailed" };
  }
  const failedPages = pages
    .filter((_, index) => written.data[index] !== "written")
    .map((p) => p.name);
  const notPrepared = [...prepared.value.values()].filter(
    (a) => a.kind === "unavailable",
  ).length;
  return {
    ok: true,
    value: {
      pages: pages.length - failedPages.length,
      failedPages,
      notPrepared,
      unresolved: citations.unresolved,
      location: `exports/html/${stamp}/index.html`,
    },
  };
}
