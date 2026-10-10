import { renderLiterature } from "@research-notebook/citations";
import { describe, expect, it } from "vitest";
import { NUMERIC_STYLE, EN_US_LOCALE } from "@research-notebook/citations";
import type { LiteratureRenderer } from "./literaturePlan";
import { formatProjectBibliography } from "./projectBibliography";

/** FR-ARC-06: one bibliography over the whole project, numbered afresh. */

const direct: LiteratureRenderer = (input) =>
  Promise.resolve(renderLiterature(input));

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

const cite = (citekey: string) => ({
  items: [{ prefix: "", suppressAuthor: false, citekey, suffix: "" }],
});

const setup = (render: LiteratureRenderer = direct) => ({
  render,
  items,
  styleXml: NUMERIC_STYLE,
  localeXml: EN_US_LOCALE,
});

describe("formatProjectBibliography", () => {
  it("lists a source once however many experiments cite it, numbered from 1", async () => {
    const result = await formatProjectBibliography(setup(), [
      cite("z:u:BBBBBBBB"),
      cite("z:u:AAAAAAAA"),
      cite("z:u:BBBBBBBB"),
    ]);

    expect(result?.entries).toHaveLength(2);
    expect(result?.entries[0]).toMatch(/^1\./u);
    expect(result?.entries[0]).toContain("Second book");
    expect(result?.entries[1]).toMatch(/^2\./u);
  });

  it("leaves out a source nothing cites", async () => {
    const result = await formatProjectBibliography(setup(), [
      cite("z:u:AAAAAAAA"),
    ]);

    expect(result?.entries.join("\n")).not.toContain("Second book");
  });

  it("is null when the engine fails or is not there", async () => {
    const failing: LiteratureRenderer = () =>
      Promise.resolve({ ok: false, error: { message: "bad style" } });
    const absent: LiteratureRenderer = () =>
      Promise.reject(new Error("no Worker"));

    expect(
      await formatProjectBibliography(setup(failing), [cite("z:u:AAAAAAAA")]),
    ).toBeNull();
    expect(
      await formatProjectBibliography(setup(absent), [cite("z:u:AAAAAAAA")]),
    ).toBeNull();
  });
});
