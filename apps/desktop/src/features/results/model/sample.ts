import type { ArtefactsFileModel } from "@research-notebook/format";

/** Test and benchmark data: result artefacts `R1`… and methods `M1`…, with ULIDs. */
export const ids = {
  r: (n: number) => `01JB${String(n).padStart(22, "0")}`,
  m: (n: number) => `01JM${String(n).padStart(22, "0")}`,
  g: (n: number) => `01JG${String(n).padStart(22, "0")}`,
};

function artefact(id: string, role: "result" | "method", name: string) {
  return {
    id,
    name,
    role,
    mode: "copy" as const,
    type: "image" as const,
    source: { root: "project", path: `out/${name}.png` },
    created: "2026-09-01T09:00:00Z",
    versions: [
      {
        v: 1,
        file: `evidence/${name}.png`,
        sha256: "a".repeat(64),
        size: 10,
        captured: "2026-09-01T09:00:00Z",
      },
    ],
  };
}

/**
 * Figures (R1, R2) holding Supplementary (R2); Tables (R3); R4 ungrouped;
 * one method artefact, which never appears in the tree.
 */
export function sampleArtefacts(): ArtefactsFileModel {
  return {
    format_version: 1,
    artefacts: [
      artefact(ids.r(1), "result", "Volcano plot"),
      artefact(ids.r(2), "result", "Heatmap"),
      artefact(ids.r(3), "result", "Counts"),
      artefact(ids.r(4), "result", "Loose figure"),
      artefact(ids.m(1), "method", "Pipeline"),
    ],
    groups: [
      {
        id: ids.g(1),
        name: "Figures",
        items: [ids.r(1), ids.r(2)],
        groups: [
          {
            id: ids.g(3),
            name: "Supplementary",
            items: [ids.r(2)],
            groups: [],
          },
        ],
      },
      { id: ids.g(2), name: "Tables", items: [ids.r(3)], groups: [] },
    ],
  };
}

/** `count` result artefacts split evenly over `groups` top-level groups. */
export function largeArtefacts(
  count: number,
  groups: number,
): ArtefactsFileModel {
  const artefacts = Array.from({ length: count }, (_, i) =>
    artefact(ids.r(i + 1), "result", `Figure ${i + 1}`),
  );
  const size = Math.ceil(count / groups);
  return {
    format_version: 1,
    artefacts,
    groups: Array.from({ length: groups }, (_, g) => ({
      id: ids.g(g + 1),
      name: `Group ${g + 1}`,
      items: artefacts.slice(g * size, (g + 1) * size).map((a) => a.id),
      groups: [],
    })),
  };
}
