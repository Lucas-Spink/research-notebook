import { describe, expect, it } from "vitest";
import type { BibliographyFileModel } from "../schema";
import {
  citekeyOf,
  markSourceMissing,
  upsertSource,
  type FetchedSource,
} from "./sources";

const NOW_1 = () => new Date("2026-10-02T10:00:00Z");
const NOW_2 = () => new Date("2026-10-03T10:00:00Z");

function fetched(overrides: Partial<FetchedSource> = {}): FetchedSource {
  return {
    library: "u",
    key: "ABCD2345",
    serverId: "srv-1",
    trashed: false,
    csl: { id: "ignored", type: "book", title: "First title" },
    ...overrides,
  };
}

function bibliography(): BibliographyFileModel {
  return [
    {
      id: "z:u:AAAA2222",
      type: "book",
      title: "Other",
      _zotero: {
        server_id: "srv-1",
        library: "u",
        key: "AAAA2222",
        fetched: "2026-09-01T00:00:00Z",
        status: "ok",
      },
    },
  ];
}

function added(): BibliographyFileModel {
  const result = upsertSource(bibliography(), fetched(), NOW_1);
  if (!result.ok) throw new Error("expected the source to be added");
  return result.value.file;
}

describe("citekeyOf", () => {
  it("builds z:<library>:<key>", () => {
    expect(citekeyOf("u", "ABCD2345")).toBe("z:u:ABCD2345");
    expect(citekeyOf("g123", "ABCD2345")).toBe("z:g123:ABCD2345");
  });
});

describe("upsertSource: a new source", () => {
  it("appends it after the existing items", () => {
    const file = added();
    expect(file.map((item) => item.id)).toEqual([
      "z:u:AAAA2222",
      "z:u:ABCD2345",
    ]);
  });

  it("sets id from the library and key, replacing any id Zotero sent", () => {
    expect(added()[1]?.id).toBe("z:u:ABCD2345");
  });

  it("keeps the CSL fields and records _zotero with the injected time", () => {
    expect(added()[1]).toMatchObject({
      type: "book",
      title: "First title",
      _zotero: {
        server_id: "srv-1",
        library: "u",
        key: "ABCD2345",
        fetched: "2026-10-02T10:00:00Z",
        status: "ok",
      },
    });
  });

  it("does not copy a stray _zotero from the CSL data", () => {
    const result = upsertSource(
      [],
      fetched({ csl: { type: "book", _zotero: { status: "missing" } } }),
      NOW_1,
    );
    expect(result.ok && result.value.file[0]?._zotero.status).toBe("ok");
  });

  it("records a trashed item as trashed", () => {
    const result = upsertSource([], fetched({ trashed: true }), NOW_1);
    expect(result.ok && result.value.file[0]?._zotero.status).toBe("trashed");
  });

  it("records a null server id when Zotero sent none", () => {
    const result = upsertSource([], fetched({ serverId: null }), NOW_1);
    expect(result.ok && result.value.file[0]?._zotero.server_id).toBeNull();
  });

  it("reports the change as added and leaves the input alone", () => {
    const input = bibliography();
    const before = structuredClone(input);
    const result = upsertSource(input, fetched(), NOW_1);
    expect(result.ok && result.value.change).toBe("added");
    expect(input).toEqual(before);
  });
});

describe("upsertSource: a source already held", () => {
  it("is unchanged, and keeps its fetched time, when nothing differs", () => {
    const file = added();
    const result = upsertSource(file, fetched(), NOW_2);
    expect(result.ok && result.value.change).toBe("unchanged");
    expect(result.ok && result.value.file).toEqual(file);
  });

  it("updates in place and refreshes fetched when the CSL data changed", () => {
    const result = upsertSource(
      added(),
      fetched({ csl: { type: "book", title: "Second title" } }),
      NOW_2,
    );
    expect(result.ok && result.value.change).toBe("updated");
    if (!result.ok) return;
    expect(result.value.file.map((item) => item.id)).toEqual([
      "z:u:AAAA2222",
      "z:u:ABCD2345",
    ]);
    expect(result.value.file[1]).toMatchObject({
      title: "Second title",
      _zotero: { fetched: "2026-10-03T10:00:00Z", status: "ok" },
    });
  });

  it("moves ok to trashed and back, updating fetched each time", () => {
    const trashed = upsertSource(added(), fetched({ trashed: true }), NOW_2);
    expect(trashed.ok && trashed.value.change).toBe("updated");
    expect(trashed.ok && trashed.value.file[1]?._zotero.status).toBe("trashed");
    if (!trashed.ok) return;
    const restored = upsertSource(trashed.value.file, fetched(), NOW_2);
    expect(restored.ok && restored.value.file[1]?._zotero.status).toBe("ok");
  });

  it("brings a missing source back to ok when it is fetched again", () => {
    const missing = markSourceMissing(added(), "z:u:ABCD2345");
    const result = upsertSource(missing.file, fetched(), NOW_2);
    expect(result.ok && result.value.change).toBe("updated");
    expect(result.ok && result.value.file[1]?._zotero.status).toBe("ok");
  });

  it("leaves every other item exactly as it was", () => {
    const file = added();
    const result = upsertSource(
      file,
      fetched({ csl: { type: "book", title: "Second title" } }),
      NOW_2,
    );
    expect(result.ok && result.value.file[0]).toBe(file[0]);
  });
});

describe("upsertSource: a different server id", () => {
  it("asks before overwriting and changes nothing", () => {
    const file = added();
    const result = upsertSource(
      file,
      fetched({ serverId: "srv-2", csl: { type: "book", title: "Other lib" } }),
      NOW_2,
    );
    expect(result).toEqual({
      ok: false,
      error: {
        kind: "server-mismatch",
        citekey: "z:u:ABCD2345",
        storedServerId: "srv-1",
        fetchedServerId: "srv-2",
      },
    });
    expect(file[1]).toMatchObject({ title: "First title" });
  });

  it("overwrites, recording the new server id, once the person confirms", () => {
    const result = upsertSource(
      added(),
      fetched({ serverId: "srv-2", csl: { type: "book", title: "Other lib" } }),
      NOW_2,
      { confirmServerChange: true },
    );
    expect(result.ok && result.value.change).toBe("updated");
    expect(result.ok && result.value.file[1]).toMatchObject({
      title: "Other lib",
      _zotero: { server_id: "srv-2" },
    });
  });

  it("does not ask when Zotero sent no server id this time", () => {
    const result = upsertSource(added(), fetched({ serverId: null }), NOW_2);
    expect(result.ok).toBe(true);
  });

  it("does not ask when the stored server id was unknown", () => {
    const first = upsertSource([], fetched({ serverId: null }), NOW_1);
    if (!first.ok) throw new Error("expected add");
    const result = upsertSource(first.value.file, fetched(), NOW_2);
    expect(result.ok && result.value.file[0]?._zotero.server_id).toBe("srv-1");
  });
});

describe("markSourceMissing", () => {
  it("sets the status to missing and keeps the cached metadata", () => {
    const result = markSourceMissing(added(), "z:u:ABCD2345");
    expect(result.change).toBe("updated");
    expect(result.file[1]).toMatchObject({
      title: "First title",
      _zotero: { status: "missing", fetched: "2026-10-02T10:00:00Z" },
    });
  });

  it("is unchanged when already missing", () => {
    const once = markSourceMissing(added(), "z:u:ABCD2345");
    const twice = markSourceMissing(once.file, "z:u:ABCD2345");
    expect(twice.change).toBe("unchanged");
    expect(twice.file).toEqual(once.file);
  });

  it("is unchanged for a citekey that is not held, and never adds one", () => {
    const file = bibliography();
    const result = markSourceMissing(file, "z:u:ZZZZ9999");
    expect(result).toEqual({ file, change: "unchanged" });
  });
});
