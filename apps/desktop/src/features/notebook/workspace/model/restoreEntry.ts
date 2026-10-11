import {
  parseBinNote,
  type ArtefactsFileModel,
  type BinNote,
  type Restored,
  type NotebookEnv,
  type NotebookError,
  type Result,
} from "@research-notebook/format";
import type { BinItem, commands, FolderHandle } from "../../../../ipc/bindings";
import type { ArtefactsOutcome } from "../../model/api";
import { binReasonText } from "../../table/evidenceMessages";
import { restoreBinnedFiles, type BinApi } from "../../table/model/binArtefact";

type Request = {
  api: BinApi & Pick<typeof commands, "listBin">;
  folder: FolderHandle;
  entry: BinItem;
  /** Reads the notebook from disk again, so a restored question or experiment appears. */
  refresh: () => Promise<void>;
  /** Lists a restored question or experiment in the saved order again; run after `refresh`. */
  adoptRestored: (restored: Restored) => Promise<boolean>;
  editArtefacts: (
    experimentFolder: string,
    change: (
      file: ArtefactsFileModel,
      env: NotebookEnv,
    ) => Result<ArtefactsFileModel, NotebookError>,
  ) => Promise<ArtefactsOutcome>;
};

/** What restoring came to, in words for the person. */
export type RestoreText = { ok: boolean; text: string };

/**
 * Puts one entry of the bin back (ADR-0062). A question or experiment is
 * moved back by Rust and the notebook reloaded. Removed files go back to
 * their folders and their record is added to `artefacts.yaml` again. Nothing
 * is ever replaced: a name in the way is reported and nothing moves.
 */
export async function restoreEntry({
  api,
  folder,
  entry,
  refresh,
  adoptRestored,
  editArtefacts,
}: Request): Promise<RestoreText> {
  if (entry.kind === "files") {
    const outcome = await restoreBinnedFiles({
      api,
      folder,
      stamp: entry.stamp,
      experimentFolder: entry.name,
      editArtefacts: (change) => editArtefacts(entry.name, change),
    });
    if (outcome.kind === "restored") {
      return { ok: true, text: `${outcome.name} was restored.` };
    }
    if (outcome.reason === "notRecorded") {
      return {
        ok: false,
        text: `${outcome.name}'s files are back, but the notebook could not be updated to list it. Try again, or add the files again.`,
      };
    }
    return {
      ok: false,
      text: `${outcome.name} was not restored: ${binReasonText(outcome.reason)}.`,
    };
  }
  const label =
    entry.kind === "question" ? entry.name.replace(/\.md$/i, "") : entry.name;
  const note = entry.note === null ? null : parseBinNote(entry.note);
  const moved = await api
    .restoreFromBin(folder, entry.stamp, entry.kind, entry.name)
    .catch(() => null);
  if (moved === null || moved.status === "error") {
    const reason = moved === null ? "internal" : moved.error.kind;
    return {
      ok: false,
      text: `${label} was not restored: ${binReasonText(reason)}.`,
    };
  }
  const left =
    entry.kind === "question" && note !== null
      ? await restoreExperimentsOf(api, folder, note)
      : [];
  await refresh();
  // Deleting dropped it from the saved order; put it back where it was.
  const withNote = note === null ? {} : { note };
  await adoptRestored(
    entry.kind === "question"
      ? { questionFile: entry.name, ...withNote }
      : { experimentFolder: entry.name, ...withNote },
  );
  if (left.length > 0) {
    return {
      ok: false,
      text: `${label} was restored, but ${left.join(", ")} could not be: restore ${left.length === 1 ? "it" : "them"} from the bin.`,
    };
  }
  return { ok: true, text: `${label} was restored.` };
}

/**
 * Puts back the experiments that were binned with a question (ADR-0063): for
 * each folder the note names, the most recent bin entry of that name. Returns
 * the folders that could not be restored, which stay in the bin.
 */
async function restoreExperimentsOf(
  api: Request["api"],
  folder: FolderHandle,
  note: BinNote,
): Promise<string[]> {
  if (note.experiments.length === 0) return [];
  const listed = await api.listBin(folder).catch(() => null);
  const binned = listed?.status === "ok" ? listed.data : [];
  const left: string[] = [];
  for (const name of note.experiments) {
    const newest = binned
      .filter((item) => item.kind === "experiment" && item.name === name)
      .sort((a, b) => (a.stamp < b.stamp ? 1 : a.stamp > b.stamp ? -1 : 0))[0];
    const result =
      newest === undefined
        ? null
        : await api
            .restoreFromBin(folder, newest.stamp, "experiment", name)
            .catch(() => null);
    if (result?.status !== "ok") left.push(name);
  }
  return left;
}
