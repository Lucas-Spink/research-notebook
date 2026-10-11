import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  parseArtefacts,
  type ArtefactModel,
  type ArtefactsFileModel,
  type NotebookEnv,
  type NotebookError,
  type Result,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import type { ProjectError } from "../../../../ipc/bindings";
import { testEnv } from "../../model/fakeApi";
import { referenceCountText } from "../evidenceMessages";
import {
  removeArtefactFiles,
  restoreBinnedFiles,
  type BinApi,
} from "./binArtefact";

const COPY_ID = "01JB0000000000000000000001";
const LINK_ID = "01JB0000000000000000000002";

function parsed(file: object): ArtefactsFileModel {
  return ArtefactsFile.parse(file);
}

const copy = parsed({
  format_version: 1,
  artefacts: [
    {
      id: COPY_ID,
      name: "Volcano",
      role: "result",
      mode: "copy",
      type: "image",
      source: { root: "project", path: "out/volcano.png" },
      created: "2026-09-01T09:00:00Z",
      versions: [
        {
          v: 1,
          file: "evidence/volcano.png",
          sha256: "a".repeat(64),
          size: 10,
          captured: "2026-09-01T09:00:00Z",
        },
        {
          v: 2,
          file: "evidence/volcano.v2.png",
          sha256: "b".repeat(64),
          size: 11,
          captured: "2026-09-02T09:00:00Z",
        },
      ],
    },
    {
      id: LINK_ID,
      name: "Raw reads",
      role: "result",
      mode: "link",
      type: "table",
      source: { root: "project", path: "raw/reads.csv" },
      created: "2026-09-01T09:00:00Z",
      link: {
        sha256: "c".repeat(64),
        size: 5_000_000_000,
        observed_mtime: "2026-09-01T09:00:00Z",
        checked: "2026-09-01T09:00:00Z",
      },
    },
  ],
  groups: [
    {
      id: "01JC000000000000000000000A",
      name: "Figures",
      items: [COPY_ID, LINK_ID],
      groups: [],
    },
  ],
});

function artefact(file: ArtefactsFileModel, id: string): ArtefactModel {
  const found = file.artefacts.find((a) => a.id === id);
  if (found === undefined) throw new Error("fixture");
  return found;
}

type Held = { file: ArtefactsFileModel; saves: number };

function fakeSave(start: ArtefactsFileModel, fail = false) {
  const held: Held = { file: start, saves: 0 };
  const env: NotebookEnv = testEnv();
  const edit = (
    change: (
      file: ArtefactsFileModel,
      env: NotebookEnv,
    ) => Result<ArtefactsFileModel, NotebookError>,
  ) => {
    if (fail) return Promise.resolve({ ok: false as const, error: null });
    const changed = change(held.file, env);
    if (!changed.ok) {
      return Promise.resolve({ ok: false as const, error: changed.error });
    }
    held.file = changed.value;
    held.saves += 1;
    return Promise.resolve({ ok: true as const });
  };
  return { held, edit };
}

type Calls = {
  binned: Parameters<BinApi["binArtefactFiles"]>[];
  restored: Parameters<BinApi["restoreFromBin"]>[];
};

function fakeApi(
  options: {
    binFails?: ProjectError["kind"];
    restoreFails?: ProjectError["kind"];
    record?: string;
  } = {},
) {
  const calls: Calls = { binned: [], restored: [] };
  const api: BinApi = {
    binArtefactFiles: (...args) => {
      calls.binned.push(args);
      return Promise.resolve(
        options.binFails === undefined
          ? {
              status: "ok" as const,
              data: {
                stamp: "2026-09-21T10-15-00Z",
                moved: args[2].length,
                missing: 0,
              },
            }
          : { status: "error" as const, error: { kind: options.binFails } },
      );
    },
    readBinnedRecord: () =>
      Promise.resolve({
        status: "ok" as const,
        data: options.record ?? "",
      }),
    restoreFromBin: (...args) => {
      calls.restored.push(args);
      return Promise.resolve(
        options.restoreFails === undefined
          ? { status: "ok" as const, data: null }
          : { status: "error" as const, error: { kind: options.restoreFails } },
      );
    },
  };
  return { api, calls };
}

describe("removing a file from an experiment", () => {
  it("bins a copied artefact's every version, then takes its record out", async () => {
    const { api, calls } = fakeApi();
    const save = fakeSave(copy);

    const outcome = await removeArtefactFiles({
      api,
      folder: 1,
      experimentFolder: "EXP-001",
      artefact: artefact(copy, COPY_ID),
      editArtefacts: save.edit,
    });

    expect(outcome).toEqual({
      kind: "removed",
      name: "Volcano",
      moved: 2,
      missing: 0,
    });
    const [call] = calls.binned;
    expect(call?.[1]).toBe("EXP-001");
    expect(call?.[2]).toEqual([
      "_notebook/experiments/EXP-001/evidence/volcano.png",
      "_notebook/experiments/EXP-001/evidence/volcano.v2.png",
    ]);
    expect(save.held.file.artefacts.map((a) => a.id)).toEqual([LINK_ID]);
    expect(save.held.file.groups[0]?.items).toEqual([LINK_ID]);
  });

  it("keeps the removed record in the bin as a valid file holding just that artefact", async () => {
    const { api, calls } = fakeApi();
    await removeArtefactFiles({
      api,
      folder: 1,
      experimentFolder: "EXP-001",
      artefact: artefact(copy, COPY_ID),
      editArtefacts: fakeSave(copy).edit,
    });
    const record = parseArtefacts(calls.binned[0]?.[3] ?? "");
    expect(record.ok).toBe(true);
    if (record.ok) {
      expect(record.value.artefacts.map((a) => a.id)).toEqual([COPY_ID]);
      expect(record.value.groups).toEqual([]);
    }
  });

  it("bins only the record of a linked artefact, and names no file", async () => {
    const { api, calls } = fakeApi();
    const save = fakeSave(copy);

    const outcome = await removeArtefactFiles({
      api,
      folder: 1,
      experimentFolder: "EXP-001",
      artefact: artefact(copy, LINK_ID),
      editArtefacts: save.edit,
    });

    expect(outcome).toMatchObject({ kind: "removed", moved: 0 });
    expect(calls.binned[0]?.[2]).toEqual([]);
    expect(save.held.file.artefacts.map((a) => a.id)).toEqual([COPY_ID]);
  });

  it("changes nothing in artefacts.yaml when the bin refuses", async () => {
    const { api } = fakeApi({ binFails: "notWritable" });
    const save = fakeSave(copy);

    const outcome = await removeArtefactFiles({
      api,
      folder: 1,
      experimentFolder: "EXP-001",
      artefact: artefact(copy, COPY_ID),
      editArtefacts: save.edit,
    });

    expect(outcome).toEqual({
      kind: "failed",
      name: "Volcano",
      reason: "notWritable",
    });
    expect(save.held.saves).toBe(0);
  });

  it("says so when the files are binned but artefacts.yaml could not be written", async () => {
    const { api } = fakeApi();
    const outcome = await removeArtefactFiles({
      api,
      folder: 1,
      experimentFolder: "EXP-001",
      artefact: artefact(copy, COPY_ID),
      editArtefacts: fakeSave(copy, true).edit,
    });
    expect(outcome).toEqual({
      kind: "failed",
      name: "Volcano",
      reason: "notRecorded",
    });
  });
});

describe("restoring removed files", () => {
  it("moves the files back, then adds the record again", async () => {
    const { api, calls } = fakeApi({
      record: JSON.stringify({
        format_version: 1,
        artefacts: [artefact(copy, COPY_ID)],
        groups: [],
      }),
    });
    const removed = parsed({
      ...copy,
      artefacts: [artefact(copy, LINK_ID)],
      groups: [],
    });
    const save = fakeSave(removed);

    const outcome = await restoreBinnedFiles({
      api,
      folder: 1,
      stamp: "2026-09-21T10-15-00Z",
      experimentFolder: "EXP-001",
      editArtefacts: save.edit,
    });

    expect(outcome).toEqual({ kind: "restored", name: "Volcano" });
    expect(calls.restored[0]?.slice(1)).toEqual([
      "2026-09-21T10-15-00Z",
      "files",
      "EXP-001",
    ]);
    expect(save.held.file.artefacts.map((a) => a.id)).toEqual([
      LINK_ID,
      COPY_ID,
    ]);
  });

  it("moves nothing when the record cannot be read", async () => {
    const { api, calls } = fakeApi({ record: "not: [valid" });
    const outcome = await restoreBinnedFiles({
      api,
      folder: 1,
      stamp: "2026-09-21T10-15-00Z",
      experimentFolder: "EXP-001",
      editArtefacts: fakeSave(EMPTY_ARTEFACTS).edit,
    });
    expect(outcome.kind).toBe("failed");
    expect(calls.restored).toEqual([]);
  });

  it("reports a name in the way and records nothing", async () => {
    const { api } = fakeApi({
      restoreFails: "nameTaken",
      record: JSON.stringify({
        format_version: 1,
        artefacts: [artefact(copy, COPY_ID)],
        groups: [],
      }),
    });
    const save = fakeSave(EMPTY_ARTEFACTS);
    const outcome = await restoreBinnedFiles({
      api,
      folder: 1,
      stamp: "2026-09-21T10-15-00Z",
      experimentFolder: "EXP-001",
      editArtefacts: save.edit,
    });
    expect(outcome).toEqual({
      kind: "failed",
      name: "Volcano",
      reason: "nameTaken",
    });
    expect(save.held.saves).toBe(0);
  });
});

describe("the reference count in the warning", () => {
  it("says nothing is affected when nothing refers to it", () => {
    expect(referenceCountText(0)).toBe("Nothing in the notebook refers to it.");
  });

  it("counts the places that refer to it", () => {
    expect(referenceCountText(1)).toContain("1 place refers to it");
    expect(referenceCountText(3)).toContain("3 places refer to it");
  });
});
