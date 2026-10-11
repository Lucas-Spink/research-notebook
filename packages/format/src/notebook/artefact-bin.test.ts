import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { must } from "../../test/notebook-support";
import { ArtefactsFile, type ArtefactsFileModel } from "../schema";
import { removeArtefact, restoreArtefact } from "./artefact-bin";

const R1 = "01JB0000000000000000000001";
const R2 = "01JB0000000000000000000002";
const M1 = "01JB0000000000000000000009";
const GA = "01JC000000000000000000000A";
const GC = "01JC000000000000000000000C";

function artefact(id: string, role: "result" | "method") {
  return {
    id,
    name: `Artefact ${id.slice(-1)}`,
    role,
    mode: "copy" as const,
    type: "image" as const,
    source: { root: "project", path: `out/${id}.png` },
    created: "2026-09-01T09:00:00Z",
    versions: [
      {
        v: 1,
        file: `${role === "method" ? "methods" : "evidence"}/${id}.png`,
        sha256: "a".repeat(64),
        size: 10,
        captured: "2026-09-01T09:00:00Z",
      },
    ],
  };
}

function sample(): ArtefactsFileModel {
  return {
    format_version: 2,
    artefacts: [
      artefact(R1, "result"),
      artefact(R2, "result"),
      artefact(M1, "method"),
    ],
    groups: [
      {
        id: GA,
        name: "Figures",
        items: [R1, R2],
        groups: [{ id: GC, name: "Supplementary", items: [R2], groups: [] }],
      },
    ],
  };
}

describe("removeArtefact (issue: remove files)", () => {
  it("drops the artefact and every group membership, and nothing else", () => {
    const file = must(removeArtefact(sample(), R2));
    expect(file.artefacts.map((a) => a.id)).toEqual([R1, M1]);
    expect(file.groups[0]?.items).toEqual([R1]);
    expect(file.groups[0]?.groups[0]?.items).toEqual([]);
    expect(file.groups[0]?.groups[0]?.id).toBe(GC);
  });

  it("removes a method, which is in no group", () => {
    const file = must(removeArtefact(sample(), M1));
    expect(file.artefacts.map((a) => a.id)).toEqual([R1, R2]);
    expect(file.groups).toEqual(sample().groups);
  });

  it("reports an artefact that is not there", () => {
    expect(removeArtefact(sample(), "01JB00000000000000000000ZZ")).toEqual({
      ok: false,
      error: {
        kind: "notFound",
        entity: "artefact",
        id: "01JB00000000000000000000ZZ",
      },
    });
  });

  it("does not change the file it is given", () => {
    const before = structuredClone(sample());
    const input = sample();
    removeArtefact(input, R1);
    expect(input).toEqual(before);
  });

  it("gives a file that is still valid", () => {
    const file = must(removeArtefact(sample(), R1));
    expect(ArtefactsFile.safeParse(file).success).toBe(true);
  });
});

describe("restoreArtefact", () => {
  it("adds the artefact back, ungrouped, at the end", () => {
    const removed = must(removeArtefact(sample(), R1));
    const record = sample().artefacts[0];
    if (record === undefined) throw new Error("fixture");
    const file = must(restoreArtefact(removed, record));
    expect(file.artefacts.map((a) => a.id)).toEqual([R2, M1, R1]);
    expect(file.groups[0]?.items).toEqual([R2]);
  });

  it("refuses an artefact whose id is already in the file", () => {
    const record = sample().artefacts[0];
    if (record === undefined) throw new Error("fixture");
    const result = restoreArtefact(sample(), record);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("invalid");
  });
});

describe("removing then restoring (property)", () => {
  it("brings back the same artefacts, whichever one is removed", () => {
    const all = sample().artefacts;
    fc.assert(
      fc.property(fc.integer({ min: 0, max: all.length - 1 }), (index) => {
        const record = all[index];
        if (record === undefined) return false;
        const removed = removeArtefact(sample(), record.id);
        if (!removed.ok) return false;
        const back = restoreArtefact(removed.value, record);
        if (!back.ok) return false;
        const ids = back.value.artefacts.map((a) => a.id).sort();
        return (
          JSON.stringify(ids) === JSON.stringify(all.map((a) => a.id).sort())
        );
      }),
      { numRuns: Number(process.env["FC_NUM_RUNS"] ?? 100) },
    );
  });
});
