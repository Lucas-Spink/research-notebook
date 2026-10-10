import type { Arranged, CitationCluster } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { arrangedWithFigures, projectYaml } from "./fixtures";
import { exportPdf, type PdfExportApi } from "./pdfExport";

type Read = Awaited<ReturnType<PdfExportApi["readNotebookFile"]>>;
type Written = Awaited<ReturnType<PdfExportApi["writePdfExport"]>>;

const textFile = (text: string): Read => ({
  status: "ok",
  data: { kind: "text", text, sha256: "a".repeat(64) },
});

function fakeApi(
  options: {
    read?: Read | "reject";
    written?: Written | "reject";
  } = {},
) {
  const writes: unknown[][] = [];
  const reads: unknown[][] = [];
  const api: PdfExportApi = {
    appVersion: () => Promise.resolve("0.2.0"),
    readNotebookFile: (...args) => {
      reads.push(args);
      const read = options.read ?? textFile('[{"id":"z:u:7XK2PQ9M"}]\n');
      return read === "reject"
        ? Promise.reject(new Error("gone"))
        : Promise.resolve(read);
    },
    writePdfExport: (...args) => {
      writes.push(args);
      const written = options.written ?? { status: "ok", data: "written" };
      return written === "reject"
        ? Promise.reject(new Error("gone"))
        : Promise.resolve(written);
    },
  };
  return { api, writes, reads };
}

function citing(): Arranged {
  const arranged = arrangedWithFigures();
  const body = arranged.unassigned[0]?.experiment.file.body;
  if (body === undefined) throw new Error("fixture");
  const text = "Grown as before [@z:u:7XK2PQ9M, p. 4].";
  const methods = body.sections.find((s) => s.key === "methods");
  if (methods === undefined) body.sections.push({ key: "methods", body: text });
  else methods.body = text;
  return arranged;
}

function input(api: PdfExportApi, overrides: { arranged?: Arranged } = {}) {
  const asked: CitationCluster[][] = [];
  return {
    asked,
    value: {
      api,
      folder: 7,
      arranged: overrides.arranged ?? citing(),
      project: projectYaml(),
      formatBibliography: (clusters: readonly CitationCluster[]) => {
        asked.push([...clusters]);
        return Promise.resolve({ entries: ["1. Smith J. *A study*."] });
      },
      now: () => new Date("2026-10-09T12:00:00Z"),
    },
  };
}

type Sent = {
  inputJson: string;
  notebookJson: string;
  bibliographyJson: string;
};
const sentOf = (call: unknown[] | undefined): Sent => call?.[1] as Sent;

describe("exportPdf (FR-ARC-06)", () => {
  it("formats the whole project's citations as one context and sends the three texts", async () => {
    const { api, writes } = fakeApi();
    const { value, asked } = input(api);

    const result = await exportPdf(value);

    expect(result).toEqual({ ok: true, value: { written: true } });
    expect(asked).toHaveLength(1);
    expect(asked[0]?.flatMap((c) => c.items.map((i) => i.citekey))).toEqual([
      "z:u:7XK2PQ9M",
    ]);
    const sent = sentOf(writes[0]);
    expect(writes[0]?.[0]).toBe(7);
    expect(sent.bibliographyJson).toBe('[{"id":"z:u:7XK2PQ9M"}]\n');
    expect(sent.inputJson).toContain("A study");
    expect(sent.notebookJson).toContain('"generatedBy": "0.2.0"');
  });

  it("does not ask for a bibliography when nothing is cited", async () => {
    const { api, writes } = fakeApi();
    const { value, asked } = input(api, { arranged: arrangedWithFigures() });

    const result = await exportPdf(value);

    expect(result.ok).toBe(true);
    expect(asked).toEqual([]);
    expect(sentOf(writes[0]).inputJson).toContain('"bibliography": []');
  });

  it("embeds an empty bibliography when the project has no bibliography.json", async () => {
    const { api, writes } = fakeApi({
      read: { status: "ok", data: { kind: "missing" } },
    });

    await exportPdf(input(api).value);

    expect(sentOf(writes[0]).bibliographyJson).toBe("[]\n");
  });

  it("writes nothing when bibliography.json cannot be read", async () => {
    const { api, writes } = fakeApi({ read: "reject" });

    expect(await exportPdf(input(api).value)).toEqual({
      ok: false,
      error: "filesNotRead",
    });
    expect(writes).toEqual([]);
  });

  it("writes nothing when the bibliography could not be formatted", async () => {
    const { api, writes } = fakeApi();
    const { value } = input(api);

    const result = await exportPdf({
      ...value,
      formatBibliography: () => Promise.resolve(null),
    });

    expect(result).toEqual({ ok: false, error: "bibliographyFailed" });
    expect(writes).toEqual([]);
  });

  it("reports a document that could not be built, a project not open for writing and a lost connection", async () => {
    const cases: Array<[Written | "reject", string]> = [
      [{ status: "ok", data: "notBuilt" }, "notBuilt"],
      [{ status: "ok", data: "writeFailed" }, "writeFailed"],
      [{ status: "error", error: { kind: "notWritable" } }, "notWritable"],
      ["reject", "writeFailed"],
    ];
    for (const [written, error] of cases) {
      const { api } = fakeApi({ written });
      expect(await exportPdf(input(api).value)).toEqual({ ok: false, error });
    }
  });
});
