import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  type ArtefactsFileModel,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { resultsSummary } from "./resultsSummary";

/** FR-TBL-06 (ADR-0044 point 4): what a closed Results cell shows. */

const id = (n: number) =>
  `01JB00000000000000000000${String(n).padStart(2, "0")}`;
const sha = (n: number) => String(n).repeat(64).slice(0, 64);

function artefact(
  n: number,
  name: string,
  options: {
    role?: "result" | "method";
    linked?: boolean;
    versions?: number;
  } = {},
) {
  const common = {
    id: id(n),
    name,
    role: options.role ?? "result",
    type: "image",
    source: { root: "project", path: `results/${name}.png` },
    created: "2026-09-26T10:00:00Z",
  };
  if (options.linked) {
    const link = {
      sha256: sha(n),
      size: 10,
      observed_mtime: "2026-09-26T10:00:00Z",
      checked: "2026-09-26T10:00:00Z",
    };
    return { ...common, mode: "link", link };
  }
  const versions = Array.from({ length: options.versions ?? 1 }, (_, i) => ({
    v: i + 1,
    file: `evidence/${name}.v${i + 1}.png`,
    sha256: sha(n + i),
    size: 10,
    captured: "2026-09-26T10:00:00Z",
  }));
  return { ...common, mode: "copy", versions };
}

/** A valid artefacts.yaml model, checked by the format's own schema. */
const file = (
  artefacts: object[],
  groups: ArtefactsFileModel["groups"] = [],
): ArtefactsFileModel =>
  ArtefactsFile.parse({ ...EMPTY_ARTEFACTS, artefacts, groups });

describe("resultsSummary", () => {
  it("is empty for an experiment with no results", () => {
    expect(resultsSummary(EMPTY_ARTEFACTS)).toEqual({
      total: 0,
      groups: [],
      ungrouped: 0,
      thumbnails: [],
    });
  });

  it("counts result artefacts only, by top-level group and ungrouped", () => {
    const summary = resultsSummary(
      file(
        [
          artefact(1, "pca"),
          artefact(2, "heatmap"),
          artefact(3, "volcano"),
          artefact(4, "protocol", { role: "method" }),
        ],
        [
          {
            id: id(90),
            name: "Figures",
            items: [id(1)],
            groups: [
              {
                id: id(91),
                name: "Supplementary",
                items: [id(2), id(1)],
                groups: [],
              },
            ],
          },
        ],
      ),
    );
    expect(summary.total).toBe(3);
    expect(summary.groups).toEqual([{ name: "Figures", count: 2 }]);
    expect(summary.ungrouped).toBe(1);
  });

  it("offers up to four thumbnails of latest versions, in the tree's order, grouped first", () => {
    const summary = resultsSummary(
      file(
        [
          artefact(1, "a"),
          artefact(2, "b", { versions: 3 }),
          artefact(3, "c"),
          artefact(4, "d"),
          artefact(5, "e"),
        ],
        [{ id: id(90), name: "Figures", items: [id(5), id(2)], groups: [] }],
      ),
    );
    expect(summary.thumbnails.map((t) => t.name)).toEqual(["e", "b", "a", "c"]);
    expect(summary.thumbnails[1]).toEqual({
      artefactId: id(2),
      name: "b",
      type: "image",
      file: "evidence/b.v3.png",
      sha256: sha(4),
    });
  });

  it("leaves out linked artefacts, which have no captured file to show", () => {
    const summary = resultsSummary(
      file([artefact(1, "big", { linked: true }), artefact(2, "small")]),
    );
    expect(summary.total).toBe(2);
    expect(summary.thumbnails.map((t) => t.name)).toEqual(["small"]);
  });
});
