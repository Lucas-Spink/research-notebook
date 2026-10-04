import { describe, expect, it } from "vitest";
import { arrangedFrom, loadedExperiment } from "../../test/notebook-support";
import {
  ARTEFACT_BATCH,
  ARTEFACT_RAW,
  ARTEFACT_TREATMENT,
  artefactsSample,
  bibliographySample,
} from "../../test/samples";
import { ArtefactsFile, BibliographyFile } from "../schema";
import type { Arranged } from "./arrange";
import {
  buildIntegrityReport,
  linkedArtefactsOf,
  versionFilesOf,
  type IntegrityObservations,
} from "./integrity";

const GONE = "01JB0000000000000000000009";
const KEY = "z:u:7XK2PQ9M";
const TRASHED_KEY = "z:g4521:ABCD2345";

const artefacts = ArtefactsFile.parse(artefactsSample);
const bibliography = BibliographyFile.parse(bibliographySample);
const okOnly = bibliography.filter((item) => item._zotero.status === "ok");

function ref(ulid: string, version?: number): string {
  const pin = version === undefined ? "" : ` v${version}`;
  return `[Figure](evidence/f.pdf "art:${ulid}${pin}")`;
}

type Evidence = NonNullable<Arranged["unassigned"][number]["artefacts"]>;

function project(
  sections: Parameters<typeof loadedExperiment>[3] = {},
  evidence: Evidence = { kind: "file", file: artefacts },
): Arranged {
  const arranged = arrangedFrom([
    loadedExperiment("EXP-001", "EXP-001", "Q1", sections),
  ]);
  const [item] = arranged.unassigned;
  if (item === undefined) throw new Error("fixture");
  item.artefacts = evidence;
  return arranged;
}

const NOTHING: IntegrityObservations = {
  versionFiles: new Map(),
  linked: new Map([[ARTEFACT_RAW, "available"]]),
};

function report(
  arranged: Arranged,
  observations: IntegrityObservations = NOTHING,
  bib = okOnly,
) {
  return buildIntegrityReport(arranged, bib, observations);
}

const BATCH_FILE = "_notebook/experiments/EXP-001/evidence/pca_by_batch.pdf";

describe("buildIntegrityReport (FR-ARC-01)", () => {
  it("reports only the external file of a clean project", () => {
    expect(report(project()).map((f) => f.kind)).toEqual(["externalFile"]);
  });

  it("reports a captured file that is not there", () => {
    const findings = report(project(), {
      ...NOTHING,
      versionFiles: new Map([[BATCH_FILE, "missing"]]),
    });
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "missingFile",
        artefactId: ARTEFACT_BATCH,
        version: 1,
        path: BATCH_FILE,
        unreadable: false,
      }),
    );
  });

  it("tells an unreadable captured file from a missing one", () => {
    const findings = report(project(), {
      ...NOTHING,
      versionFiles: new Map([[BATCH_FILE, "unreadable"]]),
    });
    expect(findings).toContainEqual(
      expect.objectContaining({ kind: "missingFile", unreadable: true }),
    );
  });

  it("reports a reference to an artefact that no longer exists", () => {
    const findings = report(project({ methods: ref(GONE) }));
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "unresolvedReference",
        ulid: GONE,
        reason: "artefact",
        section: "methods",
        experimentFolder: "EXP-001",
      }),
    );
  });

  it("reports a reference pinned to a version that does not exist", () => {
    const findings = report(
      project({ results_notes: ref(ARTEFACT_TREATMENT, 9) }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "unresolvedReference",
        ulid: ARTEFACT_TREATMENT,
        reason: "version",
        version: 9,
      }),
    );
  });

  it("accepts references to artefacts and versions that exist", () => {
    const findings = report(
      project({
        methods: `${ref(ARTEFACT_TREATMENT, 2)} ${ref(ARTEFACT_TREATMENT)} ${ref(ARTEFACT_RAW)}`,
      }),
    );
    expect(findings.map((f) => f.kind)).toEqual(["externalFile"]);
  });

  it("resolves a reference to an artefact held by another experiment", () => {
    const arranged = arrangedFrom([
      loadedExperiment("EXP-001", "EXP-001", "Q1", {}),
      loadedExperiment("EXP-002", "EXP-002", "Q1", {
        interpretation: ref(ARTEFACT_TREATMENT, 1),
      }),
    ]);
    const [first] = arranged.unassigned;
    if (first === undefined) throw new Error("fixture");
    first.artefacts = { kind: "file", file: artefacts };
    expect(report(arranged).map((f) => f.kind)).toEqual(["externalFile"]);
  });

  it("flags an unresolved reference when an artefacts.yaml could not be read", () => {
    const findings = report(
      project({ methods: ref(GONE) }, { kind: "unreadable" }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "unresolvedReference",
        mayBeInUnreadableFile: true,
      }),
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "unreadableArtefacts",
        experimentFolder: "EXP-001",
      }),
    );
  });

  it.each([
    "available",
    "missing",
    "rootUnresolved",
    "rootFolderMissing",
  ] as const)("reports a linked file that is %s", (availability) => {
    const findings = report(project(), {
      ...NOTHING,
      linked: new Map([[ARTEFACT_RAW, availability]]),
    });
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "externalFile",
        artefactId: ARTEFACT_RAW,
        availability,
      }),
    );
  });

  it("reports a linked file that has not been checked", () => {
    const findings = report(project(), { ...NOTHING, linked: new Map() });
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "externalFile",
        availability: "unchecked",
      }),
    );
  });

  it("reports a cited source that is trashed in the bibliography", () => {
    const findings = report(
      project({ methods: `See [@${TRASHED_KEY}].` }),
      NOTHING,
      bibliography,
    );
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "sourceProblem",
        citekey: TRASHED_KEY,
        state: "trashed",
        citedIn: ["EXP-001"],
      }),
    );
  });

  it("reports a cited source that is not in bibliography.json", () => {
    const findings = report(project({ methods: "[@z:u:NOSUCH99]" }));
    expect(findings).toContainEqual(
      expect.objectContaining({
        kind: "sourceProblem",
        citekey: "z:u:NOSUCH99",
        state: "notInBibliography",
      }),
    );
  });

  it("does not report a cited source that is fine", () => {
    const findings = report(project({ methods: `[@${KEY}]` }));
    expect(findings.map((f) => f.kind)).toEqual(["externalFile"]);
  });

  it("gives every finding its own stable key", () => {
    const sections = { methods: `${ref(GONE)} [@z:u:NOSUCH99]` };
    const keys = report(project(sections)).map((f) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(report(project(sections)).map((f) => f.key)).toEqual(keys);
  });
});

describe("what the check asks the filesystem about", () => {
  it("lists every captured version file by project-relative path", () => {
    expect(versionFilesOf(project()).map((f) => f.path)).toEqual([
      "_notebook/experiments/EXP-001/methods/02_pca.R",
      "_notebook/experiments/EXP-001/evidence/pca_by_treatment.pdf",
      "_notebook/experiments/EXP-001/evidence/pca_by_treatment.v2.pdf",
      BATCH_FILE,
    ]);
  });

  it("lists every linked artefact with where it was found", () => {
    expect(linkedArtefactsOf(project())).toEqual([
      { artefactId: ARTEFACT_RAW, root: "project", path: "data/counts.h5" },
    ]);
  });
});
