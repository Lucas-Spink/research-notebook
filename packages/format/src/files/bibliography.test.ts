import { describe, expect, it } from "vitest";
import { parseBibliography, serialiseBibliography } from "./bibliography";

const ITEM = {
  id: "z:u:ABCD2345",
  type: "article-journal",
  title: "A title",
  author: [{ family: "Curie", given: "Marie" }],
  _zotero: {
    server_id: "srv-1",
    library: "u",
    key: "ABCD2345",
    fetched: "2026-10-01T09:00:00Z",
    status: "ok",
  },
} as const;

describe("serialiseBibliography", () => {
  it("writes an empty bibliography as [] with a final newline", () => {
    expect(serialiseBibliography([])).toBe("[]\n");
  });

  it("puts id first and _zotero last whatever order the model has", () => {
    const shuffled = {
      title: "A title",
      _zotero: ITEM._zotero,
      type: "article-journal",
      id: ITEM.id,
    };
    const text = serialiseBibliography([shuffled]);
    const keys = Object.keys((JSON.parse(text) as unknown[])[0] as object);
    expect(keys[0]).toBe("id");
    expect(keys.at(-1)).toBe("_zotero");
  });

  it("keeps the other CSL fields in their original order", () => {
    const text = serialiseBibliography([
      {
        id: ITEM.id,
        title: "t",
        type: "book",
        abstract: "a",
        _zotero: ITEM._zotero,
      },
    ]);
    const keys = Object.keys((JSON.parse(text) as unknown[])[0] as object);
    expect(keys).toEqual(["id", "title", "type", "abstract", "_zotero"]);
  });

  it("writes _zotero keys in the documented order", () => {
    const text = serialiseBibliography([
      {
        id: ITEM.id,
        _zotero: {
          status: "ok",
          key: "ABCD2345",
          fetched: "2026-10-01T09:00:00Z",
          library: "u",
          server_id: null,
        },
      },
    ]);
    const zotero = (JSON.parse(text) as { _zotero: object }[])[0]?._zotero;
    expect(Object.keys(zotero ?? {})).toEqual([
      "server_id",
      "library",
      "key",
      "fetched",
      "status",
    ]);
  });

  it("uses two-space indentation", () => {
    expect(serialiseBibliography([ITEM])).toMatch(/^\[\n {2}\{\n {4}"id"/);
  });
});

describe("parseBibliography", () => {
  it("round-trips a valid file byte for byte", () => {
    const text = serialiseBibliography([ITEM]);
    const parsed = parseBibliography(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(serialiseBibliography(parsed.value)).toBe(text);
  });

  it("keeps unknown CSL fields", () => {
    const text = serialiseBibliography([{ ...ITEM, "custom-field": [1, 2] }]);
    const parsed = parseBibliography(text);
    expect(parsed.ok && parsed.value[0]).toMatchObject({
      "custom-field": [1, 2],
    });
  });

  it("rejects an id that disagrees with _zotero", () => {
    const text = JSON.stringify([{ ...ITEM, id: "z:u:ZZZZ2345" }]);
    expect(parseBibliography(text).ok).toBe(false);
  });

  it("rejects the same citekey twice", () => {
    expect(parseBibliography(JSON.stringify([ITEM, ITEM])).ok).toBe(false);
  });

  it("rejects text that is not JSON", () => {
    const parsed = parseBibliography("not json");
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.error.kind).toBe("syntax");
  });
});
