import {
  serialiseArtefacts,
  type ArtefactsFileModel,
} from "@research-notebook/format";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { fakeProject } from "../../model/fakeApi";
import { useExperimentArtefacts } from "./useExperimentArtefacts";

const FOLDER = 1;

const ARTEFACTS: ArtefactsFileModel = {
  format_version: 1,
  artefacts: [
    {
      id: "01JAXR5D8K2M4N6P8Q0R2S4T6V",
      name: "PCA by treatment",
      role: "result",
      type: "pdf",
      mode: "copy",
      source: { root: "project", path: "scripts/pca.R" },
      created: "2026-01-01T00:00:00Z",
      versions: [
        {
          v: 1,
          file: "evidence/pca.v1.pdf",
          sha256: "a".repeat(64),
          size: 10,
          captured: "2026-01-01T00:00:00Z",
        },
      ],
    },
  ],
  groups: [],
};

let root: Root | null = null;

afterEach(() => {
  act(() => root?.unmount());
  root = null;
});

async function run(
  api: ReturnType<typeof fakeProject>["read"],
  experimentFolder: string,
) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let held: ArtefactsFileModel | null = null;
  function Probe() {
    held = useExperimentArtefacts(api, FOLDER, experimentFolder);
    return null;
  }
  root = createRoot(document.createElement("div"));
  await act(() => {
    root?.render(<Probe />);
    return Promise.resolve();
  });
  return () => held;
}

describe("useExperimentArtefacts", () => {
  it("reads and parses the experiment's artefacts.yaml", async () => {
    const { read } = fakeProject({
      "_notebook/experiments/EXP-001/artefacts.yaml":
        serialiseArtefacts(ARTEFACTS),
    });
    const value = await run(read, "EXP-001");
    expect(value()).toEqual(ARTEFACTS);
  });

  it("resolves null when the file does not exist", async () => {
    const { read } = fakeProject({});
    const value = await run(read, "EXP-001");
    expect(value()).toBeNull();
  });

  it("resolves null when the read fails", async () => {
    const { read, faults } = fakeProject({
      "_notebook/experiments/EXP-001/artefacts.yaml":
        serialiseArtefacts(ARTEFACTS),
    });
    faults.failRead.add("_notebook/experiments/EXP-001/artefacts.yaml");
    const value = await run(read, "EXP-001");
    expect(value()).toBeNull();
  });

  it("resolves null when the file does not parse", async () => {
    const { read } = fakeProject({
      "_notebook/experiments/EXP-001/artefacts.yaml": "not: [valid",
    });
    const value = await run(read, "EXP-001");
    expect(value()).toBeNull();
  });
});
