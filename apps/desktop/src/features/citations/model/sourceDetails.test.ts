import type { BibliographyFileModel } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { sourceDetails } from "./sourceDetails";

type Item = BibliographyFileModel[number];

function item(
  extra: Record<string, unknown>,
  zotero: Partial<Item["_zotero"]> = {},
): Item {
  return {
    id: "z:u:ABCD2345",
    ...extra,
    _zotero: {
      server_id: null,
      library: "u",
      key: "ABCD2345",
      fetched: "2026-10-01T09:00:00Z",
      status: "ok",
      ...zotero,
    },
  };
}

describe("sourceDetails metadata (FR-CIT-04, FR-CIT-06)", () => {
  it("reads title, authors, year, container and DOI from the cached CSL-JSON", () => {
    const details = sourceDetails(
      item({
        title: "On radioactivity",
        author: [
          { family: "Curie", given: "Marie" },
          { literal: "The Collaboration" },
        ],
        issued: { "date-parts": [[1903, 12]] },
        "container-title": "Annals",
        DOI: "10.1000/abc-1",
      }),
    );
    expect(details).toMatchObject({
      citekey: "z:u:ABCD2345",
      title: "On radioactivity",
      authors: ["Marie Curie", "The Collaboration"],
      year: "1903",
      container: "Annals",
      doi: "10.1000/abc-1",
      library: "u",
      key: "ABCD2345",
      status: "ok",
    });
  });

  it("falls back to the citekey for a title and leaves absent fields empty", () => {
    const details = sourceDetails(item({}));
    expect(details.title).toBe("z:u:ABCD2345");
    expect(details.authors).toEqual([]);
    expect(details.year).toBeNull();
    expect(details.container).toBeNull();
    expect(details.doi).toBeNull();
  });

  it("ignores values of the wrong type", () => {
    const details = sourceDetails(
      item({ title: 5, author: "Curie", DOI: 12, "container-title": [] }),
    );
    expect(details.title).toBe("z:u:ABCD2345");
    expect(details.authors).toEqual([]);
    expect(details.doi).toBeNull();
    expect(details.container).toBeNull();
  });
});

describe("sourceDetails DOI", () => {
  it.each([
    ["10.1000/abc", "10.1000/abc"],
    ["https://doi.org/10.1000/abc", "10.1000/abc"],
    ["http://dx.doi.org/10.1000/abc", "10.1000/abc"],
    ["doi:10.1000/abc", "10.1000/abc"],
    ["  10.1000/abc  ", "10.1000/abc"],
  ])("normalises %j", (raw, expected) => {
    expect(sourceDetails(item({ DOI: raw })).doi).toBe(expected);
  });

  it.each([
    "10.1000/a&calc",
    "10.1000/a b",
    "10.1000/a%41",
    "not a doi",
    "javascript:alert(1)",
    "https://evil.example/10.1000/abc",
    "",
  ])("offers no link for %j", (raw) => {
    expect(sourceDetails(item({ DOI: raw })).doi).toBeNull();
  });
});
