import { describe, expect, it } from "vitest";
import { must } from "../../test/notebook-support";
import { serialiseArtefacts } from "../files/artefacts";
import type { ArtefactsFileModel } from "../schema";
import { renameArtefact } from "./artefactName";

const R1 = "01JB0000000000000000000001";

function sample(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      {
        id: R1,
        name: "Old name",
        role: "result",
        mode: "copy",
        type: "image",
        source: { root: "project", path: "out/plot.png" },
        created: "2026-09-01T09:00:00Z",
        classification: "main_figure",
        versions: [
          {
            v: 1,
            file: "evidence/plot.png",
            sha256: "a".repeat(64),
            size: 10,
            captured: "2026-09-01T09:00:00Z",
          },
        ],
      },
    ],
    groups: [
      { id: "01JC000000000000000000000A", name: "G", items: [R1], groups: [] },
    ],
  };
}

describe("renameArtefact", () => {
  it("changes the display name only, leaving its file, versions, groups and classification", () => {
    const before = sample();
    const after = must(renameArtefact(before, R1, "  Volcano plot "));
    expect(after.artefacts[0]).toEqual({
      ...before.artefacts[0],
      name: "Volcano plot",
    });
    expect(after.groups).toEqual(before.groups);
  });

  it("is a no-op in the file text when the name is unchanged", () => {
    const before = sample();
    const after = must(renameArtefact(before, R1, "Old name"));
    expect(serialiseArtefacts(after)).toBe(serialiseArtefacts(before));
  });

  it("refuses an unknown artefact, an empty name and a multi-line name", () => {
    expect(
      renameArtefact(sample(), "01JB00000000000000000000ZZ", "x"),
    ).toMatchObject({
      ok: false,
      error: { kind: "notFound", entity: "artefact" },
    });
    expect(renameArtefact(sample(), R1, "   ").ok).toBe(false);
    expect(renameArtefact(sample(), R1, "a\nb").ok).toBe(false);
  });
});
