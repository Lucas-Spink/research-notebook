import { DEFAULT_STYLE_XML, EN_US_LOCALE } from "@research-notebook/citations";
import { describe, expect, it, vi } from "vitest";
import { loadStyle, type StyleApi } from "./styleSource";

const ok = (data: unknown) => ({ status: "ok", data });

function api(reply: unknown): StyleApi & {
  readNotebookFile: ReturnType<typeof vi.fn>;
} {
  return { readNotebookFile: vi.fn(() => Promise.resolve(reply)) } as never;
}

describe("loadStyle", () => {
  it("reads the project's style from styles/", async () => {
    const files = api(ok({ kind: "text", text: "<style/>", sha256: "x" }));
    const style = await loadStyle(files, 7, "nature.csl");
    expect(style.styleXml).toBe("<style/>");
    expect(style.localeXml).toBe(EN_US_LOCALE);
    expect(files.readNotebookFile).toHaveBeenCalledWith(
      7,
      "_notebook/styles/nature.csl",
    );
  });

  it("falls back to the bundled style when the file is not in styles/", async () => {
    const style = await loadStyle(
      api(ok({ kind: "missing" })),
      7,
      "nature.csl",
    );
    expect(style.styleXml).toBe(DEFAULT_STYLE_XML);
  });

  it("falls back when the read fails or throws", async () => {
    const failed = api({ status: "error", error: { kind: "io" } });
    expect((await loadStyle(failed, 7, "a.csl")).styleXml).toBe(
      DEFAULT_STYLE_XML,
    );
    const throwing = {
      readNotebookFile: () => Promise.reject(new Error("ipc")),
    } as never as StyleApi;
    expect((await loadStyle(throwing, 7, "a.csl")).styleXml).toBe(
      DEFAULT_STYLE_XML,
    );
  });

  it("falls back without reading when the project names no style", async () => {
    const files = api(ok({ kind: "missing" }));
    expect((await loadStyle(files, 7, null)).styleXml).toBe(DEFAULT_STYLE_XML);
    expect(files.readNotebookFile).not.toHaveBeenCalled();
  });
});
