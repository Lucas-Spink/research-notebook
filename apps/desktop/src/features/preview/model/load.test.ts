import { describe, expect, it } from "vitest";
import type { PreviewFailure } from "../../../ipc/bindings";
import { loadPreview, loadThumbnail, recoveryFor } from "./load";
import { planPreview } from "./plan";
import { fakePreviewApi, TARGET } from "./fakeApi";

const plan = (fileName: string) =>
  planPreview({ fileName, type: "other", captured: true });

describe("loadPreview", () => {
  it("asks for the asset URL of images, PDF and SVG, each by its own kind", async () => {
    const api = fakePreviewApi();
    for (const [file, kind] of [
      ["a.png", "image"],
      ["a.pdf", "pdf"],
      ["a.svg", "svg"],
    ] as const) {
      const state = await loadPreview(api, TARGET, plan(file), false);
      expect(state).toEqual({
        status: "ready",
        content: { kind, url: `asset://${kind}` },
      });
    }
    expect(api.calls.map((c) => c.command)).toEqual([
      "previewAsset:image",
      "previewAsset:pdf",
      "previewAsset:svg",
    ]);
  });

  it("reads tables, first bounded and then expanded", async () => {
    const api = fakePreviewApi();
    const first = await loadPreview(api, TARGET, plan("a.csv"), false);
    const more = await loadPreview(api, TARGET, plan("a.csv"), true);
    expect(first).toMatchObject({
      status: "ready",
      content: { kind: "table", expanded: false },
    });
    expect(more).toMatchObject({
      status: "ready",
      content: { kind: "table", expanded: true },
    });
    expect(api.calls.map((c) => c.command)).toEqual([
      "previewTable:initial",
      "previewTable:expanded",
    ]);
  });

  it("reads plain text through the text command", async () => {
    const api = fakePreviewApi();
    const state = await loadPreview(api, TARGET, plan("notes.txt"), false);
    expect(api.calls.map((c) => c.command)).toEqual(["previewText"]);
    expect(state).toMatchObject({
      status: "ready",
      content: { kind: "text" },
    });
  });

  it("reads an approved script through the script command, with its language", async () => {
    const api = fakePreviewApi();
    const py = await loadPreview(api, TARGET, plan("a.py"), false);
    const r = await loadPreview(api, TARGET, plan("a.R"), false);
    const sh = await loadPreview(api, TARGET, plan("a.sh"), false);
    expect(api.calls.map((c) => c.command)).toEqual([
      "previewScript",
      "previewScript",
      "previewScript",
    ]);
    expect([py, r, sh]).toMatchObject([
      { content: { kind: "script", language: "python" } },
      { content: { kind: "script", language: "r" } },
      { content: { kind: "script", language: null } },
    ]);
  });

  it("reads a Jupyter notebook's cells, and its details beside them", async () => {
    const api = fakePreviewApi();
    const state = await loadPreview(api, TARGET, plan("a.ipynb"), false);
    expect(api.calls.map((c) => c.command).sort()).toEqual([
      "previewNotebook",
      "previewNotebookBody",
    ]);
    expect(state).toMatchObject({
      status: "ready",
      content: {
        kind: "notebookCells",
        info: { kind: "jupyter" },
        notebook: { ok: true },
      },
    });
  });

  it("reports a damaged notebook without failing the preview", async () => {
    const api = fakePreviewApi({ notebookText: "{ not json" });
    expect(
      await loadPreview(api, TARGET, plan("a.ipynb"), false),
    ).toMatchObject({
      status: "ready",
      content: {
        kind: "notebookCells",
        notebook: { ok: false, error: "notJson" },
      },
    });
  });

  it("falls back to the notebook's details when it is too large to draw", async () => {
    const api = fakePreviewApi({ notebookFail: { kind: "tooLarge" } });
    expect(
      await loadPreview(api, TARGET, plan("a.ipynb"), false),
    ).toMatchObject({
      status: "ready",
      content: {
        kind: "notebookCells",
        notebook: { ok: false, error: "tooLarge" },
      },
    });
  });

  it("fails the preview when the notebook cannot be read at all", async () => {
    const api = fakePreviewApi({ notebookFail: { kind: "fileMissing" } });
    expect(await loadPreview(api, TARGET, plan("a.ipynb"), false)).toEqual({
      status: "failed",
      failure: "fileMissing",
    });
  });

  it("shows an R Markdown document's details only, without reading its cells", async () => {
    const api = fakePreviewApi();
    await loadPreview(api, TARGET, plan("a.Rmd"), false);
    expect(api.calls.map((c) => c.command)).toEqual(["previewNotebook"]);
  });

  it("never asks for the content of HTML or other files (spec 6.7, 8)", async () => {
    const api = fakePreviewApi();
    expect(await loadPreview(api, TARGET, plan("a.html"), false)).toEqual({
      status: "ready",
      content: { kind: "html" },
    });
    expect(await loadPreview(api, TARGET, plan("a.zip"), false)).toEqual({
      status: "ready",
      content: { kind: "other", reason: "type" },
    });
    expect(api.calls).toEqual([]);
  });

  it("reports a refused preview by its failure kind", async () => {
    const api = fakePreviewApi({ fail: { kind: "tooLarge" } });
    expect(await loadPreview(api, TARGET, plan("a.svg"), false)).toEqual({
      status: "failed",
      failure: "tooLarge",
    });
  });

  it("reports a command that throws as an internal failure, not an exception", async () => {
    const api = fakePreviewApi({ throws: true });
    expect(await loadPreview(api, TARGET, plan("a.csv"), false)).toEqual({
      status: "failed",
      failure: "internal",
    });
  });
});

describe("loadThumbnail", () => {
  it("uses the cached Rust thumbnail for raster images, keyed by the version's hash", async () => {
    const api = fakePreviewApi();
    expect(await loadThumbnail(api, TARGET, plan("a.tif"))).toEqual({
      kind: "image",
      url: "asset://thumbnail",
    });
    expect(api.calls).toEqual([
      { command: "previewThumbnail", sha256: TARGET.sha256 },
    ]);
  });

  it("renders PDF and SVG thumbnails in the webview and shows an icon for the rest", async () => {
    const api = fakePreviewApi();
    expect(await loadThumbnail(api, TARGET, plan("a.pdf"))).toEqual({
      kind: "pdf",
      url: "asset://pdf",
    });
    expect(await loadThumbnail(api, TARGET, plan("a.svg"))).toEqual({
      kind: "image",
      url: "asset://svg",
    });
    expect(await loadThumbnail(api, TARGET, plan("a.csv"))).toEqual({
      kind: "icon",
      icon: "table",
    });
  });

  it("falls back to the type icon when no thumbnail can be made", async () => {
    const api = fakePreviewApi({ fail: { kind: "tooManyPixels" } });
    expect(await loadThumbnail(api, TARGET, plan("a.png"))).toEqual({
      kind: "icon",
      icon: "image",
    });
  });
});

describe("recoveryFor (FR-PRV-05)", () => {
  it("offers Try again for passing problems and the system application for the rest", () => {
    const retry: PreviewFailure["kind"][] = [
      "projectUnavailable",
      "fileMissing",
      "fileUnavailable",
      "cacheUnavailable",
      "internal",
    ];
    const external: (PreviewFailure["kind"] | "renderFailed")[] = [
      "notPreviewable",
      "tooLarge",
      "tooManyPixels",
      "unreadable",
      "renderFailed",
    ];
    for (const kind of retry) expect(recoveryFor(kind)).toBe("retry");
    for (const kind of external)
      expect(recoveryFor(kind)).toBe("openExternally");
  });
});
