import {
  buildManifest,
  type ManifestObservation,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { arranged } from "./fixtures";
import { verifyManifest, type VerifyApi } from "./verify";

const HASH = "a".repeat(64);
const PLOT = "_notebook/experiments/EXP-001/evidence/plot.pdf";
const PLOT_V2 = "_notebook/experiments/EXP-001/evidence/plot.v2.pdf";

function manifestCsv(): string {
  const seen = new Map<string, ManifestObservation>(
    [PLOT, PLOT_V2].map((path) => [
      path,
      { kind: "observed", size: 3, modifiedMs: 0, sha256: HASH },
    ]),
  );
  return buildManifest(arranged(), seen).csv;
}

type Read = Awaited<ReturnType<VerifyApi["readManifest"]>>;
type Verified = Awaited<ReturnType<VerifyApi["verifyManifestFiles"]>>;

function fakeApi(
  options: { read?: Read; verified?: Verified; rejects?: boolean } = {},
) {
  const asked: unknown[][] = [];
  const api: VerifyApi = {
    readManifest: () =>
      options.rejects === true
        ? Promise.reject(new Error())
        : Promise.resolve(
            options.read ?? {
              status: "ok",
              data: { kind: "found", text: manifestCsv() },
            },
          ),
    verifyManifestFiles: (...args) => {
      asked.push(args);
      return Promise.resolve(
        options.verified ?? {
          status: "ok",
          data: [{ kind: "matches" }, { kind: "matches" }],
        },
      );
    },
  };
  return { api, asked };
}

const run = (api: VerifyApi) =>
  verifyManifest({ api, folder: 7, arranged: arranged() });

describe("verifyManifest (FR-ARC-03)", () => {
  it("asks about each listed file with the size and hash the manifest recorded", async () => {
    const { api, asked } = fakeApi();
    const result = await run(api);
    expect(asked).toEqual([
      [
        7,
        [
          { path: PLOT, size: 3, sha256: HASH },
          { path: PLOT_V2, size: 3, sha256: HASH },
        ],
      ],
    ]);
    expect(result).toEqual({
      ok: true,
      value: { checked: 2, findings: [], unlisted: [] },
    });
  });

  it("reports each missing, unreadable and changed file by path", async () => {
    const { api } = fakeApi({
      verified: {
        status: "ok",
        data: [
          { kind: "missing" },
          { kind: "differs", sizeChanged: false, hashChanged: true },
        ],
      },
    });
    expect(await run(api)).toEqual({
      ok: true,
      value: {
        checked: 2,
        findings: [
          { kind: "missing", path: PLOT },
          { kind: "changed", path: PLOT_V2, sizeChanged: false },
        ],
        unlisted: [],
      },
    });
  });

  it("reports captured files the manifest does not list", async () => {
    const csv = manifestCsv().split("\n").slice(0, 2).join("\n") + "\n";
    const { api } = fakeApi({
      read: { status: "ok", data: { kind: "found", text: csv } },
      verified: { status: "ok", data: [{ kind: "matches" }] },
    });
    const result = await run(api);
    expect(result.ok && result.value.unlisted).toEqual([PLOT_V2]);
  });

  it.each([
    ["no manifest", { status: "ok", data: { kind: "missing" } }, "noManifest"],
    [
      "an unreadable manifest",
      { status: "ok", data: { kind: "unreadable" } },
      "manifestUnreadable",
    ],
    [
      "a malformed manifest",
      { status: "ok", data: { kind: "found", text: "nonsense\n" } },
      "manifestMalformed",
    ],
    [
      "a failed read",
      { status: "error", error: { kind: "internal" } },
      "manifestUnreadable",
    ],
  ] as const)("is not a pass when there is %s", async (_name, read, error) => {
    const { api, asked } = fakeApi({ read: read as Read });
    expect(await run(api)).toEqual({ ok: false, error });
    expect(asked).toEqual([]);
  });

  it("is not a pass when the files cannot be asked about, or the answer is short", async () => {
    for (const verified of [
      { status: "error", error: { kind: "internal" } },
      { status: "ok", data: [{ kind: "matches" }] },
    ] as Verified[]) {
      expect(await run(fakeApi({ verified }).api)).toEqual({
        ok: false,
        error: "filesNotChecked",
      });
    }
  });

  it("is not a pass when the commands reject", async () => {
    expect(await run(fakeApi({ rejects: true }).api)).toEqual({
      ok: false,
      error: "manifestUnreadable",
    });
  });
});
