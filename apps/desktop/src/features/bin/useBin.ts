import { useCallback, useEffect, useState } from "react";
import type { BinItem, FolderHandle, commands } from "../../ipc/bindings";
import { newestFirst } from "./model/entries";

/** The command the bin lists with, so tests can stand in for it. */
export type BinListApi = Pick<typeof commands, "listBin">;

/** What restoring one entry came to, in words for the person. */
export type RestoreResult = { ok: boolean; text: string };

type State =
  | { status: "loading" }
  | { status: "ready"; items: BinItem[] }
  | { status: "failed" };

/**
 * What is in the bin, newest first, and restoring one entry. Restoring is
 * done by `onRestore`, which the notebook supplies, since putting an
 * artefact's record back is a change to its experiment. The list is read
 * again after every attempt, so it always shows what is on disk.
 */
export function useBin(
  api: BinListApi,
  folder: FolderHandle,
  onRestore: (entry: BinItem) => Promise<RestoreResult>,
) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const listed = await api.listBin(folder).catch(() => null);
    if (listed === null || listed.status === "error") {
      setState({ status: "failed" });
      return;
    }
    setState({ status: "ready", items: newestFirst(listed.data) });
  }, [api, folder]);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(entry: BinItem) {
    if (busy) return;
    setBusy(true);
    try {
      const result = await onRestore(entry);
      setNotes([result.text]);
    } finally {
      setBusy(false);
    }
    await load();
  }

  return { state, notes, busy, reload: load, restore };
}
