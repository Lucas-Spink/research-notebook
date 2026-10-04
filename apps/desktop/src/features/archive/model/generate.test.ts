import { describe, expect, it } from "vitest";
import { generateManifest, type ManifestApi } from "./generate";
import { arranged } from "./fixtures";

const HASH = "a".repeat(64);
const MODIFIED = Date.UTC(2026, 8, 5, 9, 40, 52);

type Observed = Awaited<ReturnType<ManifestApi["observeVersionFiles"]>>;
type Written = Awaited<ReturnType<ManifestApi["writeManifest"]>>;

function fakeApi(
  options: {
    observed?: Observed;
    written?: Written;
    observeRejects?: boolean;
  } = {},
) {
  const calls: unknown[][] = [];
  const api: ManifestApi = {
    observeVersionFiles: (...args) => {
      calls.push(["observeVersionFiles", ...args]);
      if (options.observeRejects === true) return Promise.reject(new Error());
      return Promise.resolve(
        options.observed ?? {
          status: "ok",
          data: [1, 2].map(() => ({
            kind: "observed" as const,
            size: 3,
            modifiedMs: MODIFIED,
            sha256: HASH,
          })),
        },
      );
    },
    writeManifest: (...args) => {
      calls.push(["writeManifest", ...args]);
      return Promise.resolve(options.written ?? { status: "ok", data: null });
    },
  };
  return { api, calls };
}

describe("generateManifest (FR-ARC-02)", () => {
  it("asks about every captured file once, then writes the CSV it was given back", async () => {
    const { api, calls } = fakeApi();

    const result = await generateManifest({
      api,
      folder: 7,
      arranged: arranged(),
    });

    expect(calls[0]).toEqual([
      "observeVersionFiles",
      7,
      [
        "_notebook/experiments/EXP-001/evidence/plot.pdf",
        "_notebook/experiments/EXP-001/evidence/plot.v2.pdf",
      ],
    ]);
    expect(calls[1]?.[0]).toBe("writeManifest");
    expect(calls[1]?.[1]).toBe(7);
    expect(calls[1]?.[2]).toContain(
      `_notebook/experiments/EXP-001/evidence/plot.pdf,3,2026-09-05T09:40:52Z,${HASH},EXP-001,`,
    );
    expect(result).toEqual({ ok: true, value: { files: 2, problems: [] } });
  });

  it("reports a file the filesystem could not describe, and still writes the rest", async () => {
    const { api, calls } = fakeApi({
      observed: {
        status: "ok",
        data: [
          { kind: "observed", size: 3, modifiedMs: MODIFIED, sha256: HASH },
          { kind: "missing" },
        ],
      },
    });

    const result = await generateManifest({
      api,
      folder: 1,
      arranged: arranged(),
    });

    expect(result).toEqual({
      ok: true,
      value: {
        files: 1,
        problems: [
          {
            kind: "missing",
            path: "_notebook/experiments/EXP-001/evidence/plot.v2.pdf",
            experiment: "EXP-001",
          },
        ],
      },
    });
    expect(calls.map((c) => c[0])).toEqual([
      "observeVersionFiles",
      "writeManifest",
    ]);
  });

  it("reports a file that differs from artefacts.yaml, and writes what is on disk", async () => {
    const other = "b".repeat(64);
    const { api, calls } = fakeApi({
      observed: {
        status: "ok",
        data: [
          { kind: "observed", size: 3, modifiedMs: MODIFIED, sha256: other },
          { kind: "observed", size: 3, modifiedMs: MODIFIED, sha256: HASH },
        ],
      },
    });

    const result = await generateManifest({
      api,
      folder: 1,
      arranged: arranged(),
    });

    expect(result.ok && result.value.problems.map((p) => p.kind)).toEqual([
      "differs",
    ]);
    expect(String(calls[1]?.[2])).toContain(other);
  });

  it("treats a size or time that did not arrive as a number as unreadable", async () => {
    const { api } = fakeApi({
      observed: {
        status: "ok",
        data: [
          { kind: "observed", size: null, modifiedMs: MODIFIED, sha256: HASH },
          { kind: "observed", size: 3, modifiedMs: null, sha256: HASH },
        ],
      },
    });

    const result = await generateManifest({
      api,
      folder: 1,
      arranged: arranged(),
    });

    expect(result.ok && result.value.files).toBe(0);
    expect(result.ok && result.value.problems.map((p) => p.kind)).toEqual([
      "unreadable",
      "unreadable",
    ]);
  });

  const cannotAsk: [string, Parameters<typeof fakeApi>[0]][] = [
    [
      "the command fails",
      { observed: { status: "error", error: { kind: "internal" } } },
    ],
    ["the command rejects", { observeRejects: true }],
    [
      "fewer answers come back than were asked",
      { observed: { status: "ok", data: [] } },
    ],
  ];

  it.each(cannotAsk)("writes nothing when %s", async (_name, options) => {
    const { api, calls } = fakeApi(options);

    const result = await generateManifest({
      api,
      folder: 1,
      arranged: arranged(),
    });

    expect(result).toEqual({ ok: false, error: "filesNotChecked" });
    expect(calls.map((c) => c[0])).toEqual(["observeVersionFiles"]);
  });

  it("says so when the project is read-only", async () => {
    const { api } = fakeApi({
      written: { status: "error", error: { kind: "notWritable" } },
    });

    expect(
      await generateManifest({ api, folder: 1, arranged: arranged() }),
    ).toEqual({
      ok: false,
      error: "notWritable",
    });
  });

  it("says so when the write fails", async () => {
    const { api } = fakeApi({
      written: { status: "error", error: { kind: "writeFailed" } },
    });

    expect(
      await generateManifest({ api, folder: 1, arranged: arranged() }),
    ).toEqual({
      ok: false,
      error: "writeFailed",
    });
  });

  it("does not call the filesystem for a project with no captured files, but still writes a header", async () => {
    const empty = arranged();
    const [item] = empty.unassigned;
    if (item) delete item.artefacts;
    const { api, calls } = fakeApi();

    const result = await generateManifest({ api, folder: 1, arranged: empty });

    expect(calls.map((c) => c[0])).toEqual(["writeManifest"]);
    expect(result).toEqual({ ok: true, value: { files: 0, problems: [] } });
  });
});
