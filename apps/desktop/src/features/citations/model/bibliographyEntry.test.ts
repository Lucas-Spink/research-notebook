import type { BibliographyFileModel } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { bibliographyEntry, bibliographyRows } from "./bibliographyEntry";
import { sourceDetails } from "./sourceDetails";

function item(
  key: string,
  fields: Record<string, unknown>,
): BibliographyFileModel[number] {
  return {
    id: `z:u:${key}`,
    type: "article-journal",
    title: "A title",
    _zotero: {
      server_id: "srv",
      library: "u",
      key,
      fetched: "2026-09-01T00:00:00Z",
      status: "ok",
    },
    ...fields,
  };
}

describe("bibliographyEntry", () => {
  it("gives authors, year, title, container and DOI", () => {
    const details = sourceDetails(
      item("AAAA2222", {
        title: "Batch effects in organoids",
        author: [
          { given: "Ada", family: "Smith" },
          { given: "Bo", family: "Jones" },
        ],
        issued: { "date-parts": [[2024]] },
        "container-title": "Nature Methods",
        DOI: "10.1000/abc123",
      }),
    );
    expect(bibliographyEntry(details)).toBe(
      "Ada Smith and Bo Jones (2024). Batch effects in organoids. Nature Methods. https://doi.org/10.1000/abc123",
    );
  });

  it("lists three or more authors with commas, and leaves out what is missing", () => {
    const details = sourceDetails(
      item("BBBB3333", {
        title: "Short.",
        author: [{ family: "A" }, { family: "B" }, { family: "C" }],
      }),
    );
    expect(bibliographyEntry(details)).toBe("A, B and C. Short.");
  });

  it("is the title alone for a source with no authors or year", () => {
    expect(bibliographyEntry(sourceDetails(item("CCCC4444", {})))).toBe(
      "A title.",
    );
  });
});

describe("bibliographyRows", () => {
  const items = [
    item("AAAA2222", { title: "Zebra", author: [{ family: "Zed" }] }),
    item("BBBB3333", { title: "Apple", author: [{ family: "Abel" }] }),
  ];

  it("has one row per cited source, once, in reading order", () => {
    const rows = bibliographyRows(
      ["z:u:AAAA2222", "z:u:BBBB3333", "z:u:AAAA2222"],
      items,
      (key) => `missing ${key}`,
    );
    expect(rows.map((r) => r.citekey)).toEqual([
      "z:u:BBBB3333",
      "z:u:AAAA2222",
    ]);
  });

  it("leaves out sources nothing cites", () => {
    const rows = bibliographyRows(["z:u:BBBB3333"], items, () => "");
    expect(rows).toHaveLength(1);
  });

  it("keeps a cited source that is not cached, saying so", () => {
    const rows = bibliographyRows(
      ["z:u:GONE9999"],
      items,
      (key) => `no ${key}`,
    );
    expect(rows).toEqual([
      { citekey: "z:u:GONE9999", details: null, text: "no z:u:GONE9999" },
    ]);
  });
});
