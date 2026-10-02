import {
  parseBibliography,
  serialiseBibliography,
  type BibliographyFileModel,
} from "@research-notebook/format";
import { describe, expect, it, vi } from "vitest";
import { sha256Hex } from "../../../shared/sha256";
import { BIBLIOGRAPHY_PATH, syncSources, type SourcesApi } from "./syncSources";

const NOW = () => new Date("2026-10-02T10:00:00Z");
const FOLDER = 7;
const KEY_A = "z:u:ABCD2345";
const KEY_B = "z:u:WXYZ6789";

type Reply = unknown;
const ok = (data: unknown) => ({ status: "ok", data });
const failure = (kind: string) => ({ status: "error", error: { kind } });

const found = (title: string, serverId: string | null = "srv-1") =>
  ok({
    kind: "found",
    cslJson: JSON.stringify({ id: "ignored", type: "book", title }),
    serverId,
    trashed: false,
  });

function held(key: string, title: string, serverId: string | null = "srv-1") {
  const [, library, itemKey] = key.split(":");
  return {
    id: key,
    type: "book",
    title,
    _zotero: {
      server_id: serverId,
      library: library ?? "u",
      key: itemKey ?? "",
      fetched: "2026-09-01T00:00:00Z",
      status: "ok" as const,
    },
  };
}

/** A fake API over one in-memory `bibliography.json`, with a reply per item key. */
function world(options: {
  disk: BibliographyFileModel | string | null;
  zotero: Record<string, Reply>;
  writable?: boolean;
  racingWrite?: boolean;
}) {
  let text: string | null =
    options.disk === null || typeof options.disk === "string"
      ? options.disk
      : serialiseBibliography(options.disk);
  const writes: string[] = [];
  const api = {
    zoteroFetchSource: vi.fn((itemKey: string) =>
      Promise.resolve(options.zotero[itemKey] ?? failure("requestFailed")),
    ),
    readNotebookFile: vi.fn((_folder: number, path: string) => {
      expect(path).toBe(BIBLIOGRAPHY_PATH);
      return Promise.resolve(
        text === null
          ? ok({ kind: "missing" })
          : ok({ kind: "text", text, sha256: sha256Hex(text) }),
      );
    }),
    writeNotebookFile: vi.fn(
      (
        _folder: number,
        path: string,
        next: string,
        expected: { kind: string; sha256?: string },
      ) => {
        expect(path).toBe(BIBLIOGRAPHY_PATH);
        if (options.writable === false) {
          return Promise.resolve(failure("notWritable"));
        }
        const current = options.racingWrite === true ? "[]\n" : text;
        const matches =
          expected.kind === "absent"
            ? current === null
            : current !== null && sha256Hex(current) === expected.sha256;
        if (!matches) {
          return Promise.resolve(
            ok({ kind: "changed", current: current && sha256Hex(current) }),
          );
        }
        text = next;
        writes.push(next);
        return Promise.resolve(ok({ kind: "saved", snapshot: null }));
      },
    ),
  };
  return {
    api: api as unknown as SourcesApi,
    fake: api,
    writes,
    disk: () => text,
  };
}

const run = (
  w: ReturnType<typeof world>,
  keys: string[],
  confirmed: readonly string[] = [],
) =>
  syncSources(
    { api: w.api, folder: FOLDER, now: NOW, confirmed: new Set(confirmed) },
    keys,
  );

function titles(text: string | null): string[] {
  const parsed = parseBibliography(text ?? "[]");
  return parsed.ok ? parsed.value.map((item) => String(item.title)) : [];
}

describe("syncSources: inserting a citation (FR-CIT-05)", () => {
  it("creates bibliography.json when it does not exist yet", async () => {
    const w = world({ disk: null, zotero: { ABCD2345: found("First") } });
    const outcome = await run(w, [KEY_A]);
    expect(outcome).toMatchObject({ kind: "done", added: [KEY_A] });
    expect(w.fake.writeNotebookFile).toHaveBeenCalledWith(
      FOLDER,
      BIBLIOGRAPHY_PATH,
      expect.any(String),
      { kind: "absent" },
    );
    expect(titles(w.disk())).toEqual(["First"]);
  });

  it("appends to the existing file and guards the write with its hash", async () => {
    const disk = [held(KEY_B, "Held")];
    const before = serialiseBibliography(disk);
    const w = world({ disk, zotero: { ABCD2345: found("First") } });
    await run(w, [KEY_A]);
    expect(w.fake.writeNotebookFile).toHaveBeenCalledWith(
      FOLDER,
      BIBLIOGRAPHY_PATH,
      expect.any(String),
      { kind: "sha256", sha256: sha256Hex(before) },
    );
    expect(titles(w.disk())).toEqual(["Held", "First"]);
  });

  it("makes one write for several sources", async () => {
    const w = world({
      disk: null,
      zotero: { ABCD2345: found("First"), WXYZ6789: found("Second") },
    });
    await run(w, [KEY_A, KEY_B]);
    expect(w.writes).toHaveLength(1);
    expect(titles(w.disk())).toEqual(["First", "Second"]);
  });

  it("does not write when nothing changed", async () => {
    const w = world({
      disk: [held(KEY_A, "First")],
      zotero: { ABCD2345: found("First") },
    });
    const outcome = await run(w, [KEY_A]);
    expect(outcome).toMatchObject({ kind: "done", unchanged: [KEY_A] });
    expect(w.fake.writeNotebookFile).not.toHaveBeenCalled();
  });
});

describe("syncSources: refresh states (FR-CIT-07)", () => {
  it("marks an item that Zotero no longer has as missing, keeping its metadata", async () => {
    const w = world({
      disk: [held(KEY_A, "First")],
      zotero: { ABCD2345: ok({ kind: "missing" }) },
    });
    const outcome = await run(w, [KEY_A]);
    expect(outcome).toMatchObject({ kind: "done", missing: [KEY_A] });
    const parsed = parseBibliography(w.disk() ?? "");
    expect(parsed.ok && parsed.value[0]).toMatchObject({
      title: "First",
      _zotero: { status: "missing" },
    });
  });

  it("does not invent an entry for a missing item that was never held", async () => {
    const w = world({
      disk: null,
      zotero: { ABCD2345: ok({ kind: "missing" }) },
    });
    const outcome = await run(w, [KEY_A]);
    expect(outcome).toMatchObject({ kind: "done", failed: [KEY_A] });
    expect(w.disk()).toBeNull();
  });

  it("marks a trashed item as trashed", async () => {
    const w = world({
      disk: [held(KEY_A, "First")],
      zotero: {
        ABCD2345: ok({
          kind: "found",
          cslJson: JSON.stringify({ type: "book", title: "First" }),
          serverId: "srv-1",
          trashed: true,
        }),
      },
    });
    await run(w, [KEY_A]);
    const parsed = parseBibliography(w.disk() ?? "");
    expect(parsed.ok && parsed.value[0]?._zotero.status).toBe("trashed");
  });
});

describe("syncSources: a different server id", () => {
  const setup = () =>
    world({
      disk: [held(KEY_A, "First", "srv-1"), held(KEY_B, "Second", "srv-1")],
      zotero: {
        ABCD2345: found("From elsewhere", "srv-2"),
        WXYZ6789: found("Second, updated", "srv-1"),
      },
    });

  it("asks before overwriting, still refreshing the sources that agree", async () => {
    const w = setup();
    const outcome = await run(w, [KEY_A, KEY_B]);
    expect(outcome).toMatchObject({
      kind: "done",
      mismatches: [
        {
          kind: "server-mismatch",
          citekey: KEY_A,
          storedServerId: "srv-1",
          fetchedServerId: "srv-2",
        },
      ],
      updated: [KEY_B],
    });
    expect(titles(w.disk())).toEqual(["First", "Second, updated"]);
  });

  it("overwrites only the confirmed source", async () => {
    const w = setup();
    await run(w, [KEY_A], [KEY_A]);
    expect(titles(w.disk())).toEqual(["From elsewhere", "Second"]);
  });

  it("changes nothing when the person declines, because nothing is sent", async () => {
    const w = setup();
    const before = w.disk();
    await run(w, [KEY_A]);
    expect(w.disk()).toBe(before);
  });
});

describe("syncSources: failures leave the file alone", () => {
  it("reports Zotero not running without touching the file", async () => {
    const w = world({
      disk: [held(KEY_A, "First")],
      zotero: { ABCD2345: failure("notRunning") },
    });
    const before = w.disk();
    expect(await run(w, [KEY_A])).toEqual({
      kind: "offline",
      reason: "notRunning",
    });
    expect(w.disk()).toBe(before);
  });

  it("reports a disabled local API", async () => {
    const w = world({ disk: null, zotero: { ABCD2345: failure("disabled") } });
    expect(await run(w, [KEY_A])).toEqual({
      kind: "offline",
      reason: "disabled",
    });
  });

  it("treats a 412 as unconfirmed: reported, nothing overwritten", async () => {
    const w = world({
      disk: [held(KEY_A, "First")],
      zotero: { ABCD2345: failure("preconditionFailed") },
    });
    const before = w.disk();
    const outcome = await run(w, [KEY_A]);
    expect(outcome).toMatchObject({ kind: "done", unconfirmed: [KEY_A] });
    expect(w.disk()).toBe(before);
  });

  it("does not write when the response is not CSL-JSON", async () => {
    const w = world({
      disk: [held(KEY_A, "First")],
      zotero: {
        ABCD2345: ok({
          kind: "found",
          cslJson: "[]",
          serverId: "srv-1",
          trashed: false,
        }),
      },
    });
    const before = w.disk();
    expect(await run(w, [KEY_A])).toMatchObject({
      kind: "done",
      failed: [KEY_A],
    });
    expect(w.disk()).toBe(before);
  });

  it("leaves an unparseable bibliography.json untouched (AGENTS.md rule 5)", async () => {
    const w = world({ disk: "not json", zotero: { ABCD2345: found("First") } });
    expect(await run(w, [KEY_A])).toEqual({ kind: "unreadable" });
    expect(w.fake.writeNotebookFile).not.toHaveBeenCalled();
    expect(w.disk()).toBe("not json");
  });

  it("reports a read-only project without losing anything", async () => {
    const w = world({
      disk: null,
      zotero: { ABCD2345: found("First") },
      writable: false,
    });
    expect(await run(w, [KEY_A])).toEqual({ kind: "notWritable" });
  });

  it("does not overwrite an outside edit made since the file was read", async () => {
    const w = world({
      disk: [held(KEY_B, "Held")],
      zotero: { ABCD2345: found("First") },
      racingWrite: true,
    });
    expect(await run(w, [KEY_A])).toEqual({ kind: "changed" });
    expect(w.writes).toHaveLength(0);
  });

  it("ignores text that is not a citekey, never sending it to Zotero", async () => {
    const w = world({ disk: null, zotero: {} });
    const outcome = await run(w, ["../etc/passwd"]);
    expect(outcome).toMatchObject({ kind: "done", failed: ["../etc/passwd"] });
    expect(w.fake.zoteroFetchSource).not.toHaveBeenCalled();
  });
});
