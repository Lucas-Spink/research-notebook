import {
  applyCapture,
  applyLink,
  decideCaptureMode,
  defaultDisplayName,
  inferArtefactType,
  type ArtefactModel,
  type ArtefactsFileModel,
  type CaptureMode,
  type NotebookEnv,
  type NotebookError,
  type Result,
} from "@research-notebook/format";
import type {
  CaptureNaming,
  CaptureOutcomeDto,
  ChosenFile,
  EvidenceFailure,
  FolderHandle,
  KnownVersionInput,
  Refusal,
  commands,
} from "../../../../ipc/bindings";
import type { ArtefactsOutcome } from "../../useNotebook";

/** The commands adding a file needs, so tests can stand in for them. */
export type EvidenceApi = Pick<
  typeof commands,
  "captureEvidence" | "observeEvidence"
>;

type Located = Extract<ChosenFile, { kind: "located" }>;

/** What adding a file needs from `project.yaml`. */
export type EvidenceProject = {
  /** `capture.copy_threshold_mb` (FR-EVD-02). */
  copyThresholdMb: number;
  /** The ids of `external_roots`, which a chosen file may sit under (ADR-0044 point 1). */
  externalRoots: string[];
};

/** What happened to one file the person added (ADR-0044 points 1 and 5). */
export type AddOutcome =
  /** A new artefact was recorded. */
  | {
      kind: "added";
      name: string;
      mode: CaptureMode;
      /** The same content is already another artefact's version: a warning, not a refusal. */
      matchesOtherArtefact: boolean;
    }
  /** The file changed since it was last captured, so it is the artefact's next version. */
  | {
      kind: "newVersion";
      name: string;
      version: number;
      matchesOtherArtefact: boolean;
    }
  /** The same content is already the artefact's `version`; nothing was written. */
  | { kind: "duplicate"; name: string; version: number }
  /** A linked file records where it is, so adding it again changes nothing. */
  | { kind: "alreadyLinked"; name: string }
  /** The file is outside the project and its external roots, or is not a file. */
  | { kind: "refused"; name: string; reason: Refusal }
  /**
   * Nothing was recorded. `notRecorded` means the copy was placed but
   * `artefacts.yaml` could not be written: the file is left inside
   * `_notebook/` for the Stage 6 integrity check to report (ADR-0044 point 5).
   */
  | {
      kind: "failed";
      name: string;
      reason: EvidenceFailure["kind"] | "notRecorded";
    };

type EditArtefacts = (
  change: (
    file: ArtefactsFileModel,
    env: NotebookEnv,
  ) => Result<ArtefactsFileModel, NotebookError>,
) => Promise<ArtefactsOutcome>;

type Request = {
  api: EvidenceApi;
  folder: FolderHandle;
  projectId: string;
  /** The experiment's folder under `experiments/`. */
  experimentFolder: string;
  /** `project.yaml`'s `copy_threshold_mb` (FR-EVD-02). */
  copyThresholdMb: number;
  /** Decides copy or link for this addition only, without changing the project's default. */
  override?: CaptureMode;
  files: ChosenFile[];
  /** The experiment's `artefacts.yaml` as loaded. */
  artefacts: ArtefactsFileModel;
  /** Changes it through the notebook's queue, as every other edit does. */
  editArtefacts: EditArtefacts;
};

/** The artefact already recorded from this location, if any (FR-EVD-05). */
function recordedFrom(
  file: ArtefactsFileModel,
  location: Located["location"],
): ArtefactModel | undefined {
  return file.artefacts.find(
    (a) => a.source.root === location.root && a.source.path === location.path,
  );
}

/** Every copied version held, so a capture can tell a duplicate (ADR-0030). */
function knownVersions(
  file: ArtefactsFileModel,
  own: ArtefactModel | undefined,
): KnownVersionInput[] {
  return file.artefacts.flatMap((artefact) =>
    artefact.mode === "copy"
      ? artefact.versions.map((v) => ({
          sha256: v.sha256,
          number: v.v,
          sameArtefact: artefact === own,
        }))
      : [],
  );
}

/**
 * Names a later version after the artefact's first, so the versions of one
 * artefact sit together (FR-EVD-04): its stem and extension.
 */
function versionNaming(artefact: ArtefactModel): CaptureNaming | null {
  if (artefact.mode !== "copy") return null;
  const first = artefact.versions[0]?.file;
  if (first === undefined) return null;
  const base = first.slice(first.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot <= 0
    ? { kind: "version", stem: base, extension: "" }
    : { kind: "version", stem: base.slice(0, dot), extension: base.slice(dot) };
}

type Step = { outcome: AddOutcome; file: ArtefactsFileModel };

function provenanceOf(outcome: CaptureOutcomeDto) {
  const { provenance } = outcome;
  return provenance === null ? {} : { provenance };
}

async function link(
  request: Request,
  chosen: Located,
  current: ArtefactsFileModel,
): Promise<Step> {
  const { root, path } = chosen.location;
  const failed = (reason: EvidenceFailure["kind"] | "notRecorded"): Step => ({
    outcome: { kind: "failed", name: chosen.name, reason },
    file: current,
  });
  const observed = await request.api.observeEvidence(
    request.folder,
    request.projectId,
    root,
    path,
  );
  if (observed.status === "error") return failed(observed.error.kind);
  const { size: observedSize } = observed.data;
  // The bindings type an `f64` as nullable; a real file size never is.
  if (observedSize === null) return failed("internal");

  let recorded = current;
  const saved = await request.editArtefacts((file, env) => {
    const applied = applyLink(
      file,
      {
        name: defaultDisplayName(chosen.name),
        role: "result",
        type: inferArtefactType(chosen.name),
        source: { root, path },
      },
      {
        sha256: observed.data.sha256,
        size: observedSize,
        observedMtime: observed.data.observedMtime,
      },
      env,
    );
    if (!applied.ok) return applied;
    recorded = applied.value.file;
    return { ok: true, value: applied.value.file };
  });
  if (!saved.ok) return failed("notRecorded");
  return {
    outcome: {
      kind: "added",
      name: chosen.name,
      mode: "link",
      matchesOtherArtefact: false,
    },
    file: recorded,
  };
}

async function copy(
  request: Request,
  chosen: Located,
  current: ArtefactsFileModel,
  existing: ArtefactModel | undefined,
): Promise<Step> {
  const { root, path } = chosen.location;
  const failed = (reason: EvidenceFailure["kind"] | "notRecorded"): Step => ({
    outcome: { kind: "failed", name: chosen.name, reason },
    file: current,
  });
  const naming: CaptureNaming = (existing === undefined
    ? null
    : versionNaming(existing)) ?? {
    kind: "new",
    originalFileName: chosen.name,
  };
  const captured = await request.api.captureEvidence(
    request.folder,
    request.projectId,
    root,
    path,
    request.experimentFolder,
    existing?.role === "method" ? "methods" : "evidence",
    naming,
    knownVersions(current, existing),
  );
  if (captured.status === "error") return failed(captured.error.kind);

  const { result, matchesOtherArtefact } = captured.data;
  if (result.kind === "duplicate") {
    return {
      outcome: {
        kind: "duplicate",
        name: existing?.name ?? chosen.name,
        version: result.version,
      },
      file: current,
    };
  }

  const { size: capturedSize } = result;
  if (capturedSize === null) return failed("notRecorded");

  let recorded = current;
  const saved = await request.editArtefacts((file, env) => {
    const applied = applyCapture(
      file,
      existing === undefined
        ? {
            kind: "new",
            name: defaultDisplayName(chosen.name),
            role: "result",
            type: inferArtefactType(chosen.name),
            source: { root, path },
          }
        : { kind: "existing", artefactId: existing.id },
      {
        file: result.file,
        sha256: result.sha256,
        size: capturedSize,
        number: result.number,
        ...provenanceOf(captured.data),
      },
      env,
    );
    if (!applied.ok) return applied;
    recorded = applied.value.file;
    return { ok: true, value: applied.value.file };
  });
  if (!saved.ok) return failed("notRecorded");
  return {
    outcome:
      existing === undefined
        ? {
            kind: "added",
            name: chosen.name,
            mode: "copy",
            matchesOtherArtefact,
          }
        : {
            kind: "newVersion",
            name: existing.name,
            version: result.number,
            matchesOtherArtefact,
          },
    file: recorded,
  };
}

async function addOne(
  request: Request,
  chosen: Located,
  current: ArtefactsFileModel,
): Promise<Step> {
  const { size } = chosen;
  if (size === null) {
    return {
      outcome: { kind: "failed", name: chosen.name, reason: "internal" },
      file: current,
    };
  }
  const existing = recordedFrom(current, chosen.location);
  if (existing?.mode === "link") {
    return {
      outcome: { kind: "alreadyLinked", name: existing.name },
      file: current,
    };
  }
  // A source already recorded as a copy keeps that mode: its next version is
  // a copy however large it has grown (FR-EVD-05).
  const mode =
    existing?.mode ??
    decideCaptureMode(size, request.copyThresholdMb, request.override);
  return mode === "link"
    ? link(request, chosen, current)
    : copy(request, chosen, current, existing);
}

/**
 * Adds the files the person picked or dropped to one experiment (FR-EVD-01
 * to FR-EVD-05), one after another, each decided against what the last one
 * recorded. A file that fails does not stop the rest. The copy is placed by
 * Rust first and `artefacts.yaml` written after (ADR-0044 point 5); the
 * source is only ever read.
 */
export async function addEvidenceFiles(
  request: Request,
): Promise<AddOutcome[]> {
  const outcomes: AddOutcome[] = [];
  let current = request.artefacts;
  for (const chosen of request.files) {
    if (chosen.kind === "refused") {
      outcomes.push({
        kind: "refused",
        name: chosen.name,
        reason: chosen.reason,
      });
      continue;
    }
    const step = await addOne(request, chosen, current);
    outcomes.push(step.outcome);
    current = step.file;
  }
  return outcomes;
}
