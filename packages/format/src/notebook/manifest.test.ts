import { describe, expect, it } from "vitest";
import { arrangedFrom, loadedExperiment } from "../../test/notebook-support";
import { ARTEFACT_BATCH, artefactsSample, hex64 } from "../../test/samples";
import { ArtefactsFile } from "../schema";
import type { Arranged } from "./arrange";
import {
  buildManifest,
  manifestCell,
  type ManifestObservation,
} from "./manifest";

const artefacts = ArtefactsFile.parse(artefactsSample);

const SCRIPT = "_notebook/experiments/EXP-001/methods/02_pca.R";
const TREATMENT = "_notebook/experiments/EXP-001/evidence/pca_by_treatment.pdf";
const TREATMENT_V2 =
  "_notebook/experiments/EXP-001/evidence/pca_by_treatment.v2.pdf";
const BATCH = "_notebook/experiments/EXP-001/evidence/pca_by_batch.pdf";

const MODIFIED = Date.UTC(2026, 8, 5, 9, 40, 52, 123);

function project(): Arranged {
  const arranged = arrangedFrom([
    loadedExperiment("EXP-001", "EXP-001", "Q1", {}),
  ]);
  const [item] = arranged.unassigned;
  if (item === undefined) throw new Error("fixture");
  item.artefacts = { kind: "file", file: artefacts };
  return arranged;
}

/** What the filesystem says when every file is exactly as `artefacts.yaml` recorded it. */
function matching(): Map<string, ManifestObservation> {
  const seen = new Map<string, ManifestObservation>();
  for (const artefact of artefacts.artefacts) {
    if (artefact.mode !== "copy") continue;
    for (const version of artefact.versions) {
      seen.set(`_notebook/experiments/EXP-001/${version.file}`, {
        kind: "observed",
        size: version.size,
        modifiedMs: MODIFIED,
        sha256: version.sha256,
      });
    }
  }
  return seen;
}

describe("buildManifest (FR-ARC-02)", () => {
  it("has one row for every captured version file, sorted by path", () => {
    const { rows } = buildManifest(project(), matching());
    expect(rows.map((row) => row.path)).toEqual(
      [SCRIPT, TREATMENT, TREATMENT_V2, BATCH].sort(),
    );
  });

  it("leaves out linked files, which are not in the notebook", () => {
    const { csv } = buildManifest(project(), matching());
    expect(csv).not.toContain("counts.h5");
  });

  it("records size, modification time to the second, hash and experiment", () => {
    const { rows } = buildManifest(project(), matching());
    expect(rows.find((row) => row.path === TREATMENT)).toEqual({
      path: TREATMENT,
      size: 88213,
      modified: "2026-09-05T09:40:52Z",
      sha256: hex64("9b1c"),
      experiments: ["EXP-001"],
      groups: ["Figures"],
    });
  });

  it("lists every group an artefact is in, as a path, in tree order", () => {
    const { rows } = buildManifest(project(), matching());
    expect(rows.find((row) => row.path === BATCH)?.groups).toEqual([
      "Figures",
      "Figures/QC",
    ]);
    expect(rows.find((row) => row.path === SCRIPT)?.groups).toEqual([]);
  });

  it("writes a header, LF line endings and one line per file", () => {
    const { csv } = buildManifest(project(), matching());
    const lines = csv.split("\n");
    expect(lines[0]).toBe("path,size,modified,sha256,experiments,groups");
    expect(csv.endsWith("\n")).toBe(true);
    expect(csv).not.toContain("\r");
    expect(lines).toHaveLength(1 + 4 + 1);
  });

  it("joins several groups with a semicolon in one cell", () => {
    const { csv } = buildManifest(project(), matching());
    expect(csv).toContain(
      `${BATCH},79002,2026-09-05T09:40:52Z,${hex64("a3d5")},EXP-001,Figures;Figures/QC`,
    );
  });

  it("uses the hash the file has, and reports a difference from artefacts.yaml", () => {
    const seen = matching();
    seen.set(TREATMENT, {
      kind: "observed",
      size: 88213,
      modifiedMs: MODIFIED,
      sha256: hex64("ffff"),
    });
    const { rows, problems } = buildManifest(project(), seen);
    expect(rows.find((row) => row.path === TREATMENT)?.sha256).toBe(
      hex64("ffff"),
    );
    expect(problems).toEqual([
      { kind: "differs", path: TREATMENT, experiment: "EXP-001" },
    ]);
  });

  it("reports a size that differs from artefacts.yaml", () => {
    const seen = matching();
    seen.set(BATCH, {
      kind: "observed",
      size: 1,
      modifiedMs: MODIFIED,
      sha256: hex64("a3d5"),
    });
    expect(buildManifest(project(), seen).problems).toEqual([
      { kind: "differs", path: BATCH, experiment: "EXP-001" },
    ]);
  });

  it("leaves a missing or unreadable file out of the rows and says so", () => {
    const seen = matching();
    seen.set(SCRIPT, { kind: "missing" });
    seen.set(BATCH, { kind: "unreadable" });
    const { rows, csv, problems } = buildManifest(project(), seen);
    expect(rows.map((row) => row.path)).not.toContain(SCRIPT);
    expect(csv).not.toContain("02_pca.R");
    expect(problems).toEqual([
      { kind: "unreadable", path: BATCH, experiment: "EXP-001" },
      { kind: "missing", path: SCRIPT, experiment: "EXP-001" },
    ]);
  });

  it("treats a file nobody observed as not checked, never as clean", () => {
    const seen = matching();
    seen.delete(TREATMENT_V2);
    const { rows, problems } = buildManifest(project(), seen);
    expect(rows.map((row) => row.path)).not.toContain(TREATMENT_V2);
    expect(problems).toContainEqual({
      kind: "unreadable",
      path: TREATMENT_V2,
      experiment: "EXP-001",
    });
  });

  it("produces the same text however the observations were ordered", () => {
    const forward = matching();
    const backward = new Map([...forward].reverse());
    expect(buildManifest(project(), backward).csv).toBe(
      buildManifest(project(), forward).csv,
    );
  });

  it("names the artefact id nowhere: the manifest is about files", () => {
    expect(buildManifest(project(), matching()).csv).not.toContain(
      ARTEFACT_BATCH,
    );
  });
});

describe("manifestCell", () => {
  it("leaves plain text alone", () => {
    expect(manifestCell("Figures/QC")).toBe("Figures/QC");
  });

  it.each([
    ["a,b", '"a,b"'],
    ['say "hi"', '"say ""hi"""'],
    ["two\nlines", '"two\nlines"'],
    ["cr\rhere", '"cr\rhere"'],
  ])("quotes %j", (text, expected) => {
    expect(manifestCell(text)).toBe(expected);
  });

  it.each(["=SUM(A1)", "+1", "-1", "@x", "\tx"])(
    "stops %j being read as a formula by a spreadsheet",
    (text) => {
      expect(manifestCell(text).startsWith("'")).toBe(true);
    },
  );
});
