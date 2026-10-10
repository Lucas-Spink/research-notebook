import { describe, expect, it } from "vitest";
import { parseArtefacts, serialiseArtefacts } from "../files/artefacts";
import { must } from "../../test/notebook-support";
import type { ArtefactsFileModel } from "../schema";
import { setClassification } from "./classification";

const R1 = "01JB0000000000000000000001";
const R2 = "01JB0000000000000000000002";
const M1 = "01JB0000000000000000000009";
const GA = "01JC000000000000000000000A";

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
        file: `evidence/${id}.png`,
        sha256: "a".repeat(64),
        size: 10,
        captured: "2026-09-01T09:00:00Z",
      },
    ],
  };
}

function sample(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      artefact(R1, "result"),
      artefact(R2, "result"),
      artefact(M1, "method"),
    ],
    groups: [{ id: GA, name: "Figures", items: [R1], groups: [] }],
  };
}

describe("setClassification", () => {
  it("sets a classification and touches nothing else", () => {
    const before = sample();
    const after = must(setClassification(before, R1, "main_figure"));
    expect(after.artefacts[0]?.classification).toBe("main_figure");
    expect(after.artefacts[1]).toEqual(before.artefacts[1]);
    expect(after.groups).toEqual(before.groups);
  });

  it("is independent of groups: moving between groups keeps it", () => {
    const after = must(setClassification(sample(), R1, "main_figure"));
    expect(after.groups[0]?.items).toEqual([R1]);
    expect(after.artefacts[0]?.classification).toBe("main_figure");
  });

  it("clears a classification so the key is absent", () => {
    const set = must(setClassification(sample(), R1, "quality_control"));
    const cleared = must(setClassification(set, R1, null));
    expect(cleared.artefacts[0]).not.toHaveProperty("classification");
    expect(serialiseArtefacts(cleared)).toBe(serialiseArtefacts(sample()));
  });

  it("refuses a method, an unknown artefact and a malformed value", () => {
    expect(setClassification(sample(), M1, "general").ok).toBe(false);
    expect(
      setClassification(sample(), "01JB00000000000000000000ZZ", "general"),
    ).toMatchObject({
      ok: false,
      error: { kind: "notFound", entity: "artefact" },
    });
    expect(setClassification(sample(), R1, "Main Figure!").ok).toBe(false);
  });

  it("round-trips through the file text and keeps values this build does not know", () => {
    const set = must(setClassification(sample(), R2, "future_kind"));
    const text = serialiseArtefacts(set);
    expect(text).toContain('classification: "future_kind"');
    const again = parseArtefacts(text);
    expect(again.ok && again.value.artefacts[1]?.classification).toBe(
      "future_kind",
    );
  });

  it("reads a version 1 file written before classification existed", () => {
    const text = serialiseArtefacts(sample());
    expect(text).not.toContain("classification");
    expect(parseArtefacts(text).ok).toBe(true);
  });
});
