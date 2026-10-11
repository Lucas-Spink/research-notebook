import {
  EN_US_LOCALE,
  NUMERIC_STYLE,
  renderLiterature,
} from "@research-notebook/citations";
import type { Arranged, CitationCluster } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import type { FormatBibliography } from "./citations";
import { arrangedWithFigures, projectYaml } from "./fixtures";
import { exportHtml, type HtmlExportApi } from "./htmlExport";
import { exportPdf, type PdfExportApi } from "./pdfExport";

/** Issue #102: both exports resolve citations through the real engine, alike. */

const zotero = {
  server_id: null,
  library: "u",
  key: "X",
  fetched: "2026-01-01T00:00:00Z",
  status: "ok" as const,
};
const items = [
  { id: "z:u:AAAAAAAA", type: "book", title: "First book", _zotero: zotero },
  { id: "z:u:BBBBBBBB", type: "book", title: "Second book", _zotero: zotero },
];

const format: FormatBibliography = (clusters: readonly CitationCluster[]) => {
  const result = renderLiterature({
    clusters,
    items,
    styleXml: NUMERIC_STYLE,
    localeXml: EN_US_LOCALE,
  });
  return Promise.resolve(result.ok ? result.value : null);
};

function citing(): Arranged {
  const arranged = arrangedWithFigures();
  const body = arranged.unassigned[0]?.experiment.file.body;
  if (body === undefined) throw new Error("fixture");
  body.sections = [
    { key: "methods", body: "Second first [@z:u:BBBBBBBB]." },
    { key: "results_notes", body: "Then both [@z:u:AAAAAAAA; @z:u:BBBBBBBB]." },
    {
      key: "interpretation",
      body: "Gone [@z:u:GONEGONE] and again [@z:u:AAAAAAAA].",
    },
  ];
  return arranged;
}

async function pdfInput(): Promise<string> {
  let sent = "";
  const api = {
    appVersion: () => Promise.resolve("0.2.0"),
    readNotebookFile: () =>
      Promise.resolve({
        status: "ok",
        data: { kind: "text", text: "[]\n", sha256: "a".repeat(64) },
      }),
    writePdfExport: (_folder: number, input: { inputJson: string }) => {
      sent = input.inputJson;
      return Promise.resolve({ status: "ok", data: "written" });
    },
  } as unknown as PdfExportApi;
  await exportPdf({
    api,
    folder: 1,
    arranged: citing(),
    project: projectYaml(),
    formatBibliography: format,
    now: () => new Date("2026-10-09T12:00:00Z"),
  });
  return sent;
}

async function htmlPages(): Promise<string> {
  let sent: { html: string }[] = [];
  const api = {
    prepareHtmlAssets: (_folder: number, requests: unknown[]) =>
      Promise.resolve({
        status: "ok",
        data: requests.map(() => ({ kind: "unsupported" })),
      }),
    writeHtmlPages: (_folder: number, pages: { html: string }[]) => {
      sent = pages;
      return Promise.resolve({
        status: "ok",
        data: pages.map(() => "written"),
      });
    },
  } as unknown as HtmlExportApi;
  await exportHtml({
    api,
    folder: 1,
    arranged: citing(),
    projectName: "Yeast",
    locale: "en-GB",
    formatBibliography: format,
  });
  return sent.map((p) => p.html).join("\n");
}

describe("citations in the exports", () => {
  it("leaves no citekey in the PDF input and marks the unresolved one", async () => {
    const input = await pdfInput();
    expect(input).not.toContain("@z:u:");
    expect(input).toContain("[z:u:GONEGONE?]");
  });

  it("numbers the PDF by first appearance across Methods and Results notes", async () => {
    const input = await pdfInput();
    expect(input).toContain('"s": "[1]"');
    expect(input).toContain('"s": "[1, 2]"');
  });

  it("leaves no citekey in the HTML pages and numbers them as the PDF does", async () => {
    const html = await htmlPages();
    expect(html).not.toContain("@z:u:");
    expect(html).toContain("<cite>[1]</cite>");
    expect(html).toContain("<cite>[1, 2]</cite>");
    expect(html).toContain("<cite>[z:u:GONEGONE?]</cite>");
  });
});
