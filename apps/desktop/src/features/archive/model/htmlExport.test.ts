import { describe, expect, it } from "vitest";
import type { HtmlAssetOutcome } from "../../../ipc/bindings";
import { arranged, arrangedWithFigures } from "./fixtures";
import { exportHtml, type HtmlExportApi } from "./htmlExport";

type Prepared = Awaited<ReturnType<HtmlExportApi["prepareHtmlAssets"]>>;
type Written = Awaited<ReturnType<HtmlExportApi["writeHtmlPages"]>>;

const IMAGE = "_notebook/experiments/EXP-001/evidence/volcano.png";

function fakeApi(prepared: Prepared | "reject", written: Written | "reject") {
  const prepareCalls: unknown[][] = [];
  const writeCalls: unknown[][] = [];
  const api: HtmlExportApi = {
    prepareHtmlAssets: (...args) => {
      prepareCalls.push(args);
      return prepared === "reject"
        ? Promise.reject(new Error("gone"))
        : Promise.resolve(prepared);
    },
    writeHtmlPages: (...args) => {
      writeCalls.push(args);
      return written === "reject"
        ? Promise.reject(new Error("gone"))
        : Promise.resolve(written);
    },
  };
  return { api, prepareCalls, writeCalls };
}

const input = (api: HtmlExportApi, withFigures = true) => ({
  api,
  folder: 7,
  arranged: withFigures ? arrangedWithFigures() : arranged(),
  projectName: "Yeast",
  locale: "en-GB",
});

const imageOutcome: HtmlAssetOutcome = {
  kind: "image",
  file: `_notebook/exports/html/assets/${"3".repeat(64)}-800.png`,
  width: 800,
  height: 400,
};
const tableOutcome: HtmlAssetOutcome = {
  kind: "table",
  header: ["a"],
  rows: [["1"]],
  moreRows: false,
  moreColumns: false,
  totalRows: 1,
};

describe("exportHtml (FR-ARC-05)", () => {
  it("asks for the newest image and table, then writes the index last", async () => {
    const { api, prepareCalls, writeCalls } = fakeApi(
      { status: "ok", data: [imageOutcome, tableOutcome] },
      { status: "ok", data: ["written", "written"] },
    );

    const result = await exportHtml(input(api));

    expect(prepareCalls).toEqual([
      [
        7,
        [
          { file: IMAGE, sha256: "3".repeat(64), kind: "image" },
          {
            file: IMAGE.replace("volcano.png", "counts.csv"),
            sha256: "4".repeat(64),
            kind: "table",
          },
        ],
      ],
    ]);
    const pages = (writeCalls[0]?.[1] ?? []) as {
      name: string;
      html: string;
    }[];
    expect(pages.map((p) => p.name)).toEqual(["EXP-001.html", "index.html"]);
    expect(pages[0]?.html).toContain('<img src="assets/');
    expect(result).toEqual({
      ok: true,
      value: { pages: 2, failedPages: [], notPrepared: 0 },
    });
  });

  it("does not ask for assets when there are no images or tables", async () => {
    const { api, prepareCalls } = fakeApi(
      { status: "ok", data: [] },
      { status: "ok", data: ["written", "written"] },
    );

    await exportHtml(input(api, false));

    expect(prepareCalls).toEqual([]);
  });

  it("counts figures that could not be prepared and still writes their pages", async () => {
    const { api, writeCalls } = fakeApi(
      { status: "ok", data: [{ kind: "missing" }, { kind: "unsupported" }] },
      { status: "ok", data: ["written", "written"] },
    );

    const result = await exportHtml(input(api));

    expect(result).toEqual({
      ok: true,
      value: { pages: 2, failedPages: [], notPrepared: 1 },
    });
    const pages = (writeCalls[0]?.[1] ?? []) as { html: string }[];
    expect(pages[0]?.html).toContain("Preview not available");
    expect(pages[0]?.html).not.toContain('<img src="assets/');
  });

  it("does not point a page at a figure written outside the export folder", async () => {
    const { api, writeCalls } = fakeApi(
      {
        status: "ok",
        data: [
          { ...imageOutcome, file: "_notebook/elsewhere/x.png" },
          tableOutcome,
        ],
      },
      { status: "ok", data: ["written", "written"] },
    );

    await exportHtml(input(api));

    const pages = (writeCalls[0]?.[1] ?? []) as { html: string }[];
    expect(pages[0]?.html).not.toContain("elsewhere");
  });

  it("names the pages that could not be written", async () => {
    const { api } = fakeApi(
      { status: "ok", data: [imageOutcome, tableOutcome] },
      { status: "ok", data: ["writeFailed", "written"] },
    );

    expect(await exportHtml(input(api))).toEqual({
      ok: true,
      value: { pages: 1, failedPages: ["EXP-001.html"], notPrepared: 0 },
    });
  });

  it("fails, writing nothing, when the files cannot be prepared", async () => {
    const rejected = fakeApi("reject", { status: "ok", data: [] });
    expect(await exportHtml(input(rejected.api))).toEqual({
      ok: false,
      error: "filesNotPrepared",
    });
    expect(rejected.writeCalls).toEqual([]);

    const short = fakeApi(
      { status: "ok", data: [imageOutcome] },
      { status: "ok", data: [] },
    );
    expect(await exportHtml(input(short.api))).toEqual({
      ok: false,
      error: "filesNotPrepared",
    });
    expect(short.writeCalls).toEqual([]);
  });

  it("reports a project that is not open for writing", async () => {
    const { api, writeCalls } = fakeApi(
      { status: "error", error: { kind: "notWritable" } },
      { status: "ok", data: [] },
    );
    expect(await exportHtml(input(api))).toEqual({
      ok: false,
      error: "notWritable",
    });
    expect(writeCalls).toEqual([]);
  });

  it("fails when the pages cannot be written or are not all answered", async () => {
    const rejected = fakeApi({ status: "ok", data: [] }, "reject");
    expect(await exportHtml(input(rejected.api, false))).toEqual({
      ok: false,
      error: "writeFailed",
    });
    const short = fakeApi(
      { status: "ok", data: [] },
      { status: "ok", data: ["written"] },
    );
    expect(await exportHtml(input(short.api, false))).toEqual({
      ok: false,
      error: "writeFailed",
    });
  });
});
