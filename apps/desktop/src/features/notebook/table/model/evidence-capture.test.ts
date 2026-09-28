import {
  ArtefactsFile,
  EMPTY_ARTEFACTS,
  type ArtefactsFileModel,
  type NotebookError,
  type Result,
} from "@research-notebook/format";
import { describe, expect, it } from "vitest";
import type {
  CaptureOutcomeDto,
  ChosenFile,
  EvidenceFailure,
} from "../../../../ipc/bindings";
import { testEnv } from "../../model/fakeApi";
import {
  addEvidenceFiles,
  type AddOutcome,
  type EvidenceApi,
} from "./addEvidence";

/**
 * S4-G13 (ADR-0044): a picked or dropped file becomes a new artefact or
 * version in artefacts.yaml; a duplicate makes no version; a file outside
 * the project and external roots is refused. The copy and the hashing are
 * Rust's, so these tests fake the two commands and check what is recorded
 * and what is asked of them.
 */

const MB = 1024 * 1024;
const FOLDER = 1;
const PROJECT_ID = "01JA0000000000000000000000";

type Located = Extract<ChosenFile, { kind: "located" }>;

const located = (path: string, size = 10, root = "project"): Located => ({
  kind: "located",
  name: path.slice(path.lastIndexOf("/") + 1),
  size,
  location: { root, path },
});

const sha = (digit: string) => digit.repeat(64);

const created = (
  file: string,
  digit: string,
  number = 1,
  extra: Partial<CaptureOutcomeDto> = {},
): CaptureOutcomeDto => ({
  result: { kind: "created", file, sha256: sha(digit), size: 10, number },
  matchesOtherArtefact: false,
  provenance: null,
  ...extra,
});

type Calls = {
  captured: Parameters<EvidenceApi["captureEvidence"]>[];
  observed: Parameters<EvidenceApi["observeEvidence"]>[];
};

/** Fake commands answering from `captures` in order, and recording each call. */
function fakeApi(
  captures: (CaptureOutcomeDto | EvidenceFailure)[] = [],
  observe: { sha256: string; size: number; observedMtime: string } = {
    sha256: sha("c"),
    size: 5,
    observedMtime: "2026-09-26T09:00:00Z",
  },
) {
  const calls: Calls = { captured: [], observed: [] };
  const queue = [...captures];
  const api: EvidenceApi = {
    captureEvidence: (...args) => {
      calls.captured.push(args);
      const next = queue.shift();
      if (next === undefined) throw new Error("unexpected capture");
      return Promise.resolve(
        "result" in next
          ? { status: "ok" as const, data: next }
          : { status: "error" as const, error: next },
      );
    },
    observeEvidence: (...args) => {
      calls.observed.push(args);
      return Promise.resolve({ status: "ok" as const, data: observe });
    },
  };
  return { api, calls };
}

/** A save port applying each change to a held file, as `editArtefacts` does. */
function fakeSave(start: ArtefactsFileModel, fail = false) {
  const env = testEnv();
  const held = { file: start, saves: 0 };
  const edit = (
    change: (
      file: ArtefactsFileModel,
      env: ReturnType<typeof testEnv>,
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

type Setup = {
  files: ChosenFile[];
  captures?: (CaptureOutcomeDto | EvidenceFailure)[];
  start?: ArtefactsFileModel;
  thresholdMb?: number;
  override?: "copy" | "link";
  failSave?: boolean;
};

async function add({
  files,
  captures,
  start = EMPTY_ARTEFACTS,
  thresholdMb = 50,
  override,
  failSave = false,
}: Setup) {
  const { api, calls } = fakeApi(captures);
  const save = fakeSave(start, failSave);
  const outcomes = await addEvidenceFiles({
    api,
    folder: FOLDER,
    projectId: PROJECT_ID,
    experimentFolder: "EXP-001",
    copyThresholdMb: thresholdMb,
    ...(override !== undefined && { override }),
    files,
    artefacts: start,
    editArtefacts: save.edit,
  });
  return { outcomes, calls, held: save.held };
}

const only = (outcomes: AddOutcome[]) => {
  expect(outcomes).toHaveLength(1);
  const [first] = outcomes;
  if (first === undefined) throw new Error("no outcome");
  return first;
};

describe("adding a file within the copy threshold", () => {
  it("copies it and records a new result artefact with one version", async () => {
    const { outcomes, calls, held } = await add({
      files: [located("results/pca plot.png")],
      captures: [created("evidence/pca plot.png", "a")],
    });

    expect(only(outcomes)).toMatchObject({
      kind: "added",
      name: "pca plot.png",
      mode: "copy",
    });
    const [call] = calls.captured;
    expect(call?.slice(0, 6)).toEqual([
      FOLDER,
      PROJECT_ID,
      "project",
      "results/pca plot.png",
      "EXP-001",
      "evidence",
    ]);
    expect(call?.[6]).toEqual({
      kind: "new",
      originalFileName: "pca plot.png",
    });
    expect(call?.[7]).toEqual([]);
    expect(ArtefactsFile.safeParse(held.file).success).toBe(true);
    expect(held.file.artefacts).toHaveLength(1);
    expect(held.file.artefacts[0]).toMatchObject({
      name: "pca plot",
      role: "result",
      mode: "copy",
      type: "image",
      source: { root: "project", path: "results/pca plot.png" },
      versions: [
        { v: 1, file: "evidence/pca plot.png", sha256: sha("a"), size: 10 },
      ],
    });
  });

  it("keeps the source's git provenance on the version", async () => {
    const { held } = await add({
      files: [located("analysis/fit.py")],
      captures: [
        created("evidence/fit.py", "a", 1, {
          provenance: {
            repo: "git@example.org:lab/fit.git",
            commit: "f".repeat(40),
            pathInRepo: "analysis/fit.py",
            fileDirty: true,
            treeDirty: false,
          },
        }),
      ],
    });

    const artefact = held.file.artefacts[0];
    expect(artefact?.mode === "copy" && artefact.versions[0]).toMatchObject({
      provenance: {
        repo: "git@example.org:lab/fit.git",
        path_in_repo: "analysis/fit.py",
        file_dirty: true,
        tree_dirty: false,
      },
    });
  });

  it("warns when the same content is already another artefact", async () => {
    const { outcomes } = await add({
      files: [located("results/copy.png")],
      captures: [
        created("evidence/copy.png", "a", 1, { matchesOtherArtefact: true }),
      ],
    });

    expect(only(outcomes)).toMatchObject({
      kind: "added",
      matchesOtherArtefact: true,
    });
  });
});

describe("adding a file above the copy threshold", () => {
  it("records it in place as a link and never copies it", async () => {
    const { outcomes, calls, held } = await add({
      files: [located("raw/reads.csv", 60 * MB)],
    });

    expect(only(outcomes)).toMatchObject({ kind: "added", mode: "link" });
    expect(calls.captured).toHaveLength(0);
    expect(calls.observed).toEqual([
      [FOLDER, PROJECT_ID, "project", "raw/reads.csv"],
    ]);
    expect(held.file.artefacts[0]).toMatchObject({
      mode: "link",
      type: "table",
      source: { root: "project", path: "raw/reads.csv" },
      link: { sha256: sha("c"), size: 5 },
    });
  });

  it("links every file when the project's threshold is zero", async () => {
    const { calls } = await add({
      files: [located("results/tiny.png", 1)],
      thresholdMb: 0,
    });

    expect(calls.captured).toHaveLength(0);
    expect(calls.observed).toHaveLength(1);
  });

  it("copies it when the person overrides to copy, without changing the threshold", async () => {
    const { calls } = await add({
      files: [located("raw/reads.csv", 60 * MB)],
      captures: [created("evidence/reads.csv", "a")],
      override: "copy",
    });

    expect(calls.captured).toHaveLength(1);
    expect(calls.observed).toHaveLength(0);
  });

  it("links a small file when the person overrides to link", async () => {
    const { calls } = await add({
      files: [located("results/small.png", 1)],
      override: "link",
    });

    expect(calls.captured).toHaveLength(0);
    expect(calls.observed).toHaveLength(1);
  });
});

describe("adding a file that is already recorded", () => {
  const recorded = ArtefactsFile.parse({
    ...EMPTY_ARTEFACTS,
    artefacts: [
      {
        id: "01JB0000000000000000000001",
        name: "PCA plot",
        role: "result",
        mode: "copy",
        type: "image",
        source: { root: "project", path: "results/pca.png" },
        created: "2026-09-26T10:00:00Z",
        versions: [
          {
            v: 1,
            file: "evidence/pca.png",
            sha256: sha("a"),
            size: 10,
            captured: "2026-09-26T10:00:00Z",
          },
        ],
      },
      {
        id: "01JB0000000000000000000002",
        name: "Reads",
        role: "result",
        mode: "link",
        type: "table",
        source: { root: "project", path: "raw/reads.csv" },
        created: "2026-09-26T10:00:00Z",
        link: {
          sha256: sha("d"),
          size: 5,
          observed_mtime: "2026-09-26T09:00:00Z",
          checked: "2026-09-26T10:00:00Z",
        },
      },
    ],
  });

  it("adds a changed file from the same source as the next version", async () => {
    const { outcomes, calls, held } = await add({
      files: [located("results/pca.png")],
      captures: [created("evidence/pca_v2.png", "b", 2)],
      start: recorded,
    });

    expect(only(outcomes)).toMatchObject({
      kind: "newVersion",
      name: "PCA plot",
      version: 2,
    });
    const [call] = calls.captured;
    expect(call?.[6]).toEqual({
      kind: "version",
      stem: "pca",
      extension: ".png",
    });
    expect(call?.[7]).toEqual([
      { sha256: sha("a"), number: 1, sameArtefact: true },
    ]);
    const artefact = held.file.artefacts[0];
    expect(artefact?.mode === "copy" && artefact.versions).toHaveLength(2);
    expect(held.file.artefacts).toHaveLength(2);
  });

  it("makes no version for a duplicate and does not save", async () => {
    const { outcomes, held } = await add({
      files: [located("results/pca.png")],
      captures: [
        {
          result: { kind: "duplicate", version: 1 },
          matchesOtherArtefact: false,
          provenance: null,
        },
      ],
      start: recorded,
    });

    expect(only(outcomes)).toEqual({
      kind: "duplicate",
      name: "PCA plot",
      version: 1,
    });
    expect(held.saves).toBe(0);
  });

  it("tells the capture about every version already held, marking the artefact's own", async () => {
    const { calls } = await add({
      files: [located("results/other.png")],
      captures: [created("evidence/other.png", "e")],
      start: recorded,
    });

    expect(calls.captured[0]?.[7]).toEqual([
      { sha256: sha("a"), number: 1, sameArtefact: false },
    ]);
  });

  it("leaves a linked file alone when it is added again", async () => {
    const { outcomes, calls, held } = await add({
      files: [located("raw/reads.csv", 60 * MB)],
      start: recorded,
    });

    expect(only(outcomes)).toEqual({
      kind: "alreadyLinked",
      name: "Reads",
    });
    expect(calls.captured).toHaveLength(0);
    expect(calls.observed).toHaveLength(0);
    expect(held.saves).toBe(0);
  });
});

describe("adding files that cannot be recorded", () => {
  it("reports a refused file with its reason without asking Rust", async () => {
    const { outcomes, calls, held } = await add({
      files: [
        {
          kind: "refused",
          name: "notes.txt",
          reason: { kind: "outsideRoots" },
        },
      ],
    });

    expect(only(outcomes)).toEqual({
      kind: "refused",
      name: "notes.txt",
      reason: { kind: "outsideRoots" },
    });
    expect(calls.captured).toHaveLength(0);
    expect(calls.observed).toHaveLength(0);
    expect(held.saves).toBe(0);
  });

  it("fails a file whose size the bindings could not carry", async () => {
    const { outcomes, calls } = await add({
      files: [{ ...located("results/pca.png"), size: null }],
    });

    expect(only(outcomes)).toMatchObject({
      kind: "failed",
      reason: "internal",
    });
    expect(calls.captured).toHaveLength(0);
  });

  it("reports a failed capture and records nothing", async () => {
    const { outcomes, held } = await add({
      files: [located("results/pca.png")],
      captures: [{ kind: "sourceUnavailable" }],
    });

    expect(only(outcomes)).toMatchObject({ kind: "failed", name: "pca.png" });
    expect(held.saves).toBe(0);
  });

  it("reports a file that was copied but could not be recorded", async () => {
    const { outcomes } = await add({
      files: [located("results/pca.png")],
      captures: [created("evidence/pca.png", "a")],
      failSave: true,
    });

    expect(only(outcomes)).toMatchObject({
      kind: "failed",
      name: "pca.png",
      reason: "notRecorded",
    });
  });
});

describe("adding several files", () => {
  it("records each against what the last one recorded", async () => {
    const { outcomes, calls, held } = await add({
      files: [located("results/a.png"), located("results/a.png")],
      captures: [
        created("evidence/a.png", "a"),
        {
          result: { kind: "duplicate", version: 1 },
          matchesOtherArtefact: false,
          provenance: null,
        },
      ],
    });

    expect(outcomes.map((o) => o.kind)).toEqual(["added", "duplicate"]);
    expect(calls.captured[1]?.[6]).toEqual({
      kind: "version",
      stem: "a",
      extension: ".png",
    });
    expect(calls.captured[1]?.[7]).toEqual([
      { sha256: sha("a"), number: 1, sameArtefact: true },
    ]);
    expect(held.file.artefacts).toHaveLength(1);
  });

  it("carries on with the rest after one fails", async () => {
    const { outcomes, held } = await add({
      files: [located("results/a.png"), located("results/b.png")],
      captures: [{ kind: "sourceUnavailable" }, created("evidence/b.png", "b")],
    });

    expect(outcomes.map((o) => o.kind)).toEqual(["failed", "added"]);
    expect(held.file.artefacts).toHaveLength(1);
  });
});
