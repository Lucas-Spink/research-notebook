import type { IntegrityFinding } from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { resolveTargetOf } from "./resolution";

const where = { experimentFolder: "EXP-001", experimentRef: "EXP-001" };

describe("resolveTargetOf", () => {
  it("sends a missing captured file to the experiment's Results", () => {
    const finding: IntegrityFinding = {
      key: "k",
      kind: "missingFile",
      ...where,
      artefactId: "a",
      artefactName: "Plot",
      version: 1,
      path: "_notebook/experiments/EXP-001/evidence/p.pdf",
      unreadable: false,
    };
    expect(resolveTargetOf(finding)).toEqual({
      kind: "results",
      experimentFolder: "EXP-001",
    });
  });

  it.each([
    ["available", false],
    ["unchecked", false],
    ["missing", true],
    ["rootUnresolved", true],
    ["rootFolderMissing", true],
  ] as const)(
    "a linked file that is %s: resolvable is %s",
    (availability, can) => {
      const finding: IntegrityFinding = {
        key: "k",
        kind: "externalFile",
        ...where,
        artefactId: "a",
        artefactName: "Counts",
        root: "project",
        path: "data/c.h5",
        availability,
      };
      expect(resolveTargetOf(finding) !== null).toBe(can);
    },
  );

  it("sends an unresolved reference to the section that holds it", () => {
    const finding: IntegrityFinding = {
      key: "k",
      kind: "unresolvedReference",
      ...where,
      experimentTitle: "One",
      section: "interpretation",
      ulid: "u",
      version: null,
      reason: "artefact",
      mayBeInUnreadableFile: false,
    };
    expect(resolveTargetOf(finding)).toEqual({
      kind: "experiment",
      experimentFolder: "EXP-001",
      section: "interpretation",
    });
  });

  it("sends a source problem to the source", () => {
    const finding: IntegrityFinding = {
      key: "k",
      kind: "sourceProblem",
      citekey: "z:u:AAAA2222",
      state: "trashed",
      citedIn: [],
    };
    expect(resolveTargetOf(finding)).toEqual({
      kind: "source",
      citekey: "z:u:AAAA2222",
    });
  });

  it("leaves an unreadable evidence file to be acknowledged", () => {
    expect(
      resolveTargetOf({ key: "k", kind: "unreadableArtefacts", ...where }),
    ).toBeNull();
  });
});
