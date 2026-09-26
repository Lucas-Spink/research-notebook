import {
  EMPTY_ARTEFACTS,
  type ArrangedExperiment,
  type ArtefactsFileModel,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import { evidenceOf } from "./evidence";
import { sampleNotebook } from "./fakeApi";

/** ADR-0044 point 3: what a row or the expanded view shows of an experiment's artefacts.yaml. */

const { state } = sampleNotebook();
const experiment = state.experiments[0];
if (experiment === undefined) throw new Error("sample");
const item = (
  artefacts?: ArrangedExperiment["artefacts"],
): ArrangedExperiment => ({
  experiment,
  readOnly: false,
  absentFromOrder: false,
  ...(artefacts === undefined ? {} : { artefacts }),
});

const file: ArtefactsFileModel = { ...EMPTY_ARTEFACTS, groups: [] };

describe("evidenceOf", () => {
  it("is the loaded file", () => {
    expect(evidenceOf(item({ kind: "file", file }))).toBe(file);
  });

  it("is an empty file for an experiment with no artefacts.yaml yet", () => {
    expect(evidenceOf(item())).toEqual(EMPTY_ARTEFACTS);
  });

  it("is null when artefacts.yaml could not be read, so nothing is built on it", () => {
    expect(evidenceOf(item({ kind: "unreadable" }))).toBeNull();
  });
});
