import type {
  ArtefactsFileModel,
  NotebookEnv,
  NotebookError,
  Result,
} from "@research-notebook/format";
import type { BinItem, FolderHandle } from "../../../../ipc/bindings";
import type { ArtefactsOutcome } from "../../model/api";
import { binReasonText } from "../../table/evidenceMessages";
import { restoreBinnedFiles, type BinApi } from "../../table/model/binArtefact";

type Request = {
  api: BinApi;
  folder: FolderHandle;
  entry: BinItem;
  /** Reads the notebook from disk again, so a restored question or experiment appears. */
  refresh: () => Promise<void>;
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
  await refresh();
  return { ok: true, text: `${label} was restored.` };
}
