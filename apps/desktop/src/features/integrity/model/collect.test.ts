import type { BibliographyFileModel } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import type { IntegrityApi } from "./collect";
import { runIntegrityCheck } from "./collect";
import { arranged } from "./fixtures";

const NO_SOURCES: BibliographyFileModel = [];

function fakeApi(
  options: {
    problems?: { index: number; missing: boolean }[];
    availability?: "ok" | "fail";
    checkFails?: boolean;
  } = {},
) {
  const calls: unknown[][] = [];
  const api: IntegrityApi = {
    checkVersionFiles: (...args) => {
      calls.push(["checkVersionFiles", ...args]);
      return Promise.resolve(
        options.checkFails === true
          ? { status: "error", error: { kind: "internal" } }
          : { status: "ok", data: options.problems ?? [] },
      );
    },
    linkedArtefactAvailability: (...args) => {
      calls.push(["linkedArtefactAvailability", ...args]);
      return Promise.resolve(
        options.availability === "fail"
          ? { status: "error", error: { kind: "fileUnavailable" } }
          : { status: "ok", data: { kind: "missing" } },
      );
    },
  };
  return { api, calls };
}

describe("runIntegrityCheck", () => {
  it("asks about every captured file in one call and every linked file by location", async () => {
    const { api, calls } = fakeApi();

    await runIntegrityCheck({
      api,
      folder: 7,
      projectId: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
      arranged: arranged(),
      bibliography: NO_SOURCES,
    });

    expect(calls).toEqual([
      [
        "checkVersionFiles",
        7,
        [
          "_notebook/experiments/EXP-001/evidence/plot.pdf",
          "_notebook/experiments/EXP-001/evidence/plot.v2.pdf",
        ],
      ],
      [
        "linkedArtefactAvailability",
        7,
        "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
        "project",
        "data/counts.h5",
      ],
    ]);
  });

  it("turns what Rust found into findings", async () => {
    const { api } = fakeApi({ problems: [{ index: 1, missing: true }] });

    const result = await runIntegrityCheck({
      api,
      folder: 7,
      projectId: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
      arranged: arranged(),
      bibliography: NO_SOURCES,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toContainEqual(
      expect.objectContaining({
        kind: "missingFile",
        path: "_notebook/experiments/EXP-001/evidence/plot.v2.pdf",
        unreadable: false,
      }),
    );
    expect(result.value).toContainEqual(
      expect.objectContaining({
        kind: "externalFile",
        availability: "missing",
      }),
    );
  });

  it("fails rather than report a clean project when the files cannot be checked", async () => {
    const { api } = fakeApi({ checkFails: true });

    const result = await runIntegrityCheck({
      api,
      folder: 7,
      projectId: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
      arranged: arranged(),
      bibliography: NO_SOURCES,
    });

    expect(result).toEqual({ ok: false, error: "filesNotChecked" });
  });

  it("reports a linked file as unchecked when its check fails", async () => {
    const { api } = fakeApi({ availability: "fail" });

    const result = await runIntegrityCheck({
      api,
      folder: 7,
      projectId: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
      arranged: arranged(),
      bibliography: NO_SOURCES,
    });

    expect(result.ok && result.value).toContainEqual(
      expect.objectContaining({
        kind: "externalFile",
        availability: "unchecked",
      }),
    );
  });

  it("makes no calls for a project with no evidence", async () => {
    const { api, calls } = fakeApi();

    const result = await runIntegrityCheck({
      api,
      folder: 7,
      projectId: "01JAX9Q2B7N4M8T6V3W5Y1Z0KC",
      arranged: { questions: [], unassigned: [], problems: [] },
      bibliography: NO_SOURCES,
    });

    expect(result).toEqual({ ok: true, value: [] });
    expect(calls).toEqual([]);
  });
});
