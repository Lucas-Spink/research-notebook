import {
  parseArtefacts,
  removeArtefact,
  restoreArtefact,
  serialiseArtefacts,
  type ArtefactModel,
  type ArtefactsFileModel,
  type NotebookEnv,
  type NotebookError,
  type Result,
} from "@research-notebook/format";
import type {
  FolderHandle,
  ProjectError,
  commands,
} from "../../../../ipc/bindings";
import type { ArtefactsOutcome } from "../../model/api";

/** The commands removing and restoring files need, so tests can stand in for them. */
export type BinApi = Pick<
  typeof commands,
  "binArtefactFiles" | "readBinnedRecord" | "restoreFromBin"
>;

/** Changes this experiment's artefacts.yaml through the notebook's queue. */
type EditArtefacts = (
  change: (
    file: ArtefactsFileModel,
    env: NotebookEnv,
  ) => Result<ArtefactsFileModel, NotebookError>,
) => Promise<ArtefactsOutcome>;

export type RemoveOutcome =
  | { kind: "removed"; name: string; moved: number; missing: number }
  | {
      kind: "failed";
      name: string;
      /** `notRecorded`: the files are in the bin but artefacts.yaml was not changed. */
      reason: ProjectError["kind"] | "notRecorded";
    };

export type RestoreOutcome =
  | { kind: "restored"; name: string }
  | {
      kind: "failed";
      name: string;
      /** `unreadable`: the kept record could not be read, so nothing was moved. */
      reason: ProjectError["kind"] | "unreadable" | "notRecorded";
    };

/**
 * The project-relative path of a version's file, as the commands take it:
 * the experiment's folder, then the version's `file` under `evidence/` or
 * `methods/` (spec 5.8).
 */
function versionFilePath(experimentFolder: string, file: string): string {
  return `_notebook/experiments/${experimentFolder}/${file}`;
}

type RemoveRequest = {
  api: BinApi;
  folder: FolderHandle;
  experimentFolder: string;
  artefact: ArtefactModel;
  editArtefacts: EditArtefacts;
};

/**
 * Removes a file from an experiment (FR-EVD-10, ADR-0062): a copied
 * artefact's versions move to the bin, beside a record of the artefact, and
 * then its entry leaves `artefacts.yaml`. A linked artefact has no copy to
 * move: only its record is kept, and the original is never touched. The bin
 * comes first, so a failure after it leaves the files recoverable and the
 * record still listed, never a record with no file and no copy.
 */
export async function removeArtefactFiles({
  api,
  folder,
  experimentFolder,
  artefact,
  editArtefacts,
}: RemoveRequest): Promise<RemoveOutcome> {
  const name = artefact.name;
  const files =
    artefact.mode === "copy"
      ? artefact.versions.map((v) => versionFilePath(experimentFolder, v.file))
      : [];
  const record = serialiseArtefacts({
    format_version: 1,
    artefacts: [artefact],
    groups: [],
  });
  const binned = await api
    .binArtefactFiles(folder, experimentFolder, files, record)
    .catch(() => null);
  if (binned === null) return { kind: "failed", name, reason: "internal" };
  if (binned.status === "error") {
    return { kind: "failed", name, reason: binned.error.kind };
  }
  const saved = await editArtefacts((file) =>
    removeArtefact(file, artefact.id),
  );
  if (!saved.ok) return { kind: "failed", name, reason: "notRecorded" };
  return {
    kind: "removed",
    name,
    moved: binned.data.moved,
    missing: binned.data.missing,
  };
}

type RestoreRequest = {
  api: BinApi;
  folder: FolderHandle;
  stamp: string;
  experimentFolder: string;
  editArtefacts: EditArtefacts;
};

/**
 * Brings removed files back (ADR-0062): the kept record is read and checked
 * first, so nothing moves if it is unusable; then the files go back to their
 * folders, refused whole if any place is taken; then the record is added to
 * `artefacts.yaml` again, in no group.
 */
export async function restoreBinnedFiles({
  api,
  folder,
  stamp,
  experimentFolder,
  editArtefacts,
}: RestoreRequest): Promise<RestoreOutcome> {
  const unnamed = experimentFolder;
  const read = await api
    .readBinnedRecord(folder, stamp, experimentFolder)
    .catch(() => null);
  if (read === null || read.status === "error") {
    return { kind: "failed", name: unnamed, reason: "unreadable" };
  }
  const parsed = parseArtefacts(read.data);
  const record = parsed.ok ? parsed.value.artefacts[0] : undefined;
  if (record === undefined) {
    return { kind: "failed", name: unnamed, reason: "unreadable" };
  }
  const name = record.name;
  const moved = await api
    .restoreFromBin(folder, stamp, "files", experimentFolder)
    .catch(() => null);
  if (moved === null) return { kind: "failed", name, reason: "internal" };
  if (moved.status === "error") {
    return { kind: "failed", name, reason: moved.error.kind };
  }
  const saved = await editArtefacts((file) => restoreArtefact(file, record));
  if (!saved.ok) return { kind: "failed", name, reason: "notRecorded" };
  return { kind: "restored", name };
}
