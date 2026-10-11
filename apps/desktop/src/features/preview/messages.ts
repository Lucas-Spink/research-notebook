import type { Encoding, NotebookKind } from "../../ipc/bindings";
import type { FailureKind } from "./model/load";
import type { PreviewPlan } from "./model/plan";

/** User-facing text for previews, in British English (AGENTS.md section 5). */
export const previewMessages = {
  loading: "Loading preview…",
  retry: "Try again",
  openExternally: "Open with system application",
  imageAlt: (name: string) => `Preview of ${name}`,
  thumbnailAlt: (name: string) => `Thumbnail of ${name}`,
  fitToPanel: "Fit to panel",
  actualSize: "Actual size",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  resetZoom: "Reset zoom",
  pdf: {
    page: (page: number, pages: number) => `Page ${page} of ${pages}`,
    previous: "Previous page",
    next: "Next page",
  },
  table: {
    caption: (name: string) => `First rows of ${name}`,
    showing: (rows: number) =>
      rows === 1 ? "Showing the first row." : `Showing the first ${rows} rows.`,
    moreColumns: "Only the first 50 columns are shown.",
    dimensions: (rows: number, columns: number) =>
      `${rows.toLocaleString("en-GB")} ${rows === 1 ? "row" : "rows"}, ${columns.toLocaleString("en-GB")} ${columns === 1 ? "column" : "columns"}`,
    notCounted:
      "The file is too large to count here, so its dimensions are not shown.",
    expand: "Show up to 2,000 rows",
    encoding: (name: string) => `Read as ${name}.`,
  },
  encoding: {
    utf8: "UTF-8",
    utf8Bom: "UTF-8 with a byte-order mark",
    windows1252: "Windows-1252",
  } satisfies Record<Encoding, string>,
  text: {
    label: (name: string) => `Contents of ${name}`,
    truncated: "Only the first 500 lines are shown.",
  },
  code: {
    label: (name: string) => `Source of ${name}`,
    languages: { python: "Python", r: "R", plain: "Script" },
    readOnly: "Read only",
    lines: (count: number) =>
      count === 1 ? "1 line" : `${count.toLocaleString("en-GB")} lines`,
    openExternally: "Open externally",
    wrap: "Wrap lines",
    search: "Search in script",
    searchPlaceholder: "Find…",
    next: "Next match",
    previous: "Previous match",
    noMatches: "No matches",
    matches: (current: number, total: number, capped: boolean) =>
      `${current} of ${total.toLocaleString("en-GB")}${capped ? "+" : ""}`,
    truncated: (lines: number) =>
      `Only the first ${lines.toLocaleString("en-GB")} lines are shown. Open the script externally to read the rest.`,
    empty: "This script is empty.",
  },
  cells: {
    label: (name: string) => `Cells of ${name}`,
    summary: (count: number) =>
      count === 0
        ? "No cells"
        : count === 1
          ? "1 cell"
          : `${count.toLocaleString("en-GB")} cells`,
    readOnly: "Saved output only; nothing is run",
    collapseAll: "Collapse all cells",
    expandAll: "Expand all cells",
    collapse: (n: number) => `Collapse cell ${n}`,
    expand: (n: number) => `Expand cell ${n}`,
    kinds: { markdown: "Markdown", code: "Code", raw: "Raw" },
    input: (count: number | null) => `In [${count ?? " "}]:`,
    output: "Output",
    errorOutput: "Error",
    stderr: "Messages",
    cut: "Output cut short.",
    image: (mime: string) =>
      `A saved image (${mime}) is not shown here. Open the notebook in its own application to see it.`,
    html: "A saved HTML output is not shown here, because it could contain scripts.",
    unsupported: (mime: string) => `An output of type ${mime} is not shown.`,
    link: (href: string) => `Link to ${href}`,
    image_alt: (alt: string) => (alt === "" ? "[image]" : `[image: ${alt}]`),
    problems: {
      notJson:
        "This file is not valid notebook JSON, so its cells cannot be shown.",
      notNotebook:
        "This file does not have the structure of a Jupyter notebook, so its cells cannot be shown.",
      unsupportedVersion: "Only notebook format 4 can be shown as cells.",
      tooLarge: "This notebook is too large to show as cells (over 16 MB).",
    },
  },
  notebook: {
    kinds: {
      jupyter: "Jupyter notebook",
      rMarkdown: "R Markdown document",
      quarto: "Quarto document",
    } satisfies Record<NotebookKind, string>,
    language: "Language",
    kernel: "Kernel",
    notRecorded: "Not recorded",
    openInVsCode: "Open in VS Code",
  },
  details: {
    fileName: "File name",
    type: "Type",
    size: "Size",
    location: "Location",
  },
  types: {
    image: "Image",
    pdf: "PDF",
    svg: "SVG image",
    table: "Table",
    text: "Script or text",
    notebook: "Notebook",
    html: "HTML report",
    other: "File",
  } satisfies Record<PreviewPlan["kind"], string>,
  html: {
    note: "HTML reports are never shown inside the application, so nothing in them can run here.",
    open: "Open in browser",
  },
  other: {
    type: "There is no preview for this type of file.",
    linked:
      "This artefact is linked, so its file stays outside the project and is not previewed here.",
  },
  failures: {
    projectUnavailable:
      "The project folder cannot be opened. Check that it is still available.",
    fileMissing: "This version’s file is missing from the project.",
    fileUnavailable:
      "The file could not be opened. Another program may be using it.",
    notPreviewable: "This file cannot be previewed as this type.",
    tooLarge: "This file is too large to preview.",
    tooManyPixels: "This image is too large to preview (over 100 megapixels).",
    unreadable:
      "The file’s contents could not be read. It may be damaged or in an unexpected format.",
    cacheUnavailable: "The thumbnail store could not be used.",
    internal: "Something went wrong while making the preview.",
    renderFailed: "The file could not be displayed.",
  } satisfies Record<FailureKind, string>,
};

const UNITS = ["KB", "MB", "GB", "TB"];

/** A size in bytes as people read it, in decimal units like spec 8's bounds. */
export function formatSize(bytes: number): string {
  if (bytes < 1000) return bytes === 1 ? "1 byte" : `${bytes} bytes`;
  let value = bytes / 1000;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const digits = value < 10 ? 1 : 0;
  return `${value.toFixed(digits)} ${UNITS[unit] ?? "TB"}`;
}
