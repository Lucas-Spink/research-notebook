import type { BibliographyFileModel } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { sourceLookup, sourceView } from "./sourceView";

type Item = BibliographyFileModel[number];

function item(
  extra: Record<string, unknown>,
  status: "ok" | "trashed" | "missing" = "ok",
): Item {
  return {
    id: "z:u:ABCD2345",
    ...extra,
    _zotero: {
      server_id: null,
      library: "u",
      key: "ABCD2345",
      fetched: "2026-10-01T09:00:00Z",
      status,
    },
  };
}

describe("sourceView labels", () => {
  it("is the first author's family name and the year", () => {
    const view = sourceView(
      item({
        author: [{ family: "Curie", given: "Marie" }],
        issued: { "date-parts": [[1903, 12]] },
        title: "T",
      }),
    );
    expect(view.label).toBe("Curie 1903");
  });

  it("adds et al. for more than one author", () => {
    const view = sourceView(
      item({
        author: [{ family: "Curie" }, { family: "Becquerel" }],
        issued: { "date-parts": [[1903]] },
      }),
    );
    expect(view.label).toBe("Curie et al. 1903");
  });

  it("uses a literal author name when there is no family name", () => {
    expect(sourceView(item({ author: [{ literal: "WHO" }] })).label).toBe(
      "WHO",
    );
  });

  it("falls back to the title, then to the citekey", () => {
    expect(sourceView(item({ title: "A title" })).label).toBe("A title");
    expect(sourceView(item({})).label).toBe("z:u:ABCD2345");
  });

  it("survives malformed CSL fields", () => {
    const view = sourceView(
      item({ author: "nobody", issued: 5, title: ["x"] }),
    );
    expect(view.label).toBe("z:u:ABCD2345");
  });
});

describe("sourceView status", () => {
  it("carries ok, trashed and missing through", () => {
    expect(sourceView(item({}, "ok")).status).toBe("ok");
    expect(sourceView(item({}, "trashed")).status).toBe("trashed");
    expect(sourceView(item({}, "missing")).status).toBe("missing");
  });
});

describe("sourceLookup", () => {
  it("finds a held source by citekey and returns null otherwise", () => {
    const lookup = sourceLookup([item({ title: "A title" })]);
    expect(lookup("z:u:ABCD2345")?.label).toBe("A title");
    expect(lookup("z:u:ZZZZ9999")).toBeNull();
  });

  it("returns null for everything while there is no bibliography", () => {
    expect(sourceLookup(null)("z:u:ABCD2345")).toBeNull();
  });
});
