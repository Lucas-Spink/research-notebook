import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FolderHandle } from "../../ipc/bindings";
import { browserRandomBytes, createUlidGenerator } from "../../shared/ulid";
import { canvasMessages } from "./messages";
import { defaultCanvasName, sortEntries } from "./model/canvasFiles";
import {
  createCanvas,
  deleteCanvas,
  loadCanvases,
  renameCanvas,
  type CanvasApi,
  type CanvasEntry,
  type CanvasResult,
} from "./model/store";

type Options = {
  api: CanvasApi;
  folder: FolderHandle;
  /** Whether the project may be changed. Reading never needs it. */
  writable: boolean;
  /** Canvases are read only while the canvas view is showing. */
  enabled: boolean;
};

/** What the canvas view shows and can ask for. */
export type CanvasesModel = {
  status: "idle" | "loading" | "ready" | "failed";
  entries: readonly CanvasEntry[];
  /** The canvas being shown, by file name, or `null` when there is none. */
  selected: CanvasEntry | null;
  writable: boolean;
  busy: boolean;
  notice: string | null;
  select: (fileName: string) => void;
  /** Creates a canvas named `name` (a default one when omitted) and shows it. Resolves whether it was made. */
  create: (name?: string) => Promise<boolean>;
  /** Renames the canvas being shown. Resolves whether it was saved. */
  rename: (name: string) => Promise<boolean>;
  /** Moves the canvas being shown to the trash. Resolves whether it was moved. */
  remove: () => Promise<boolean>;
  dismissNotice: () => void;
};

/**
 * The project's canvases (ADR-0064): which exist, which is shown, and the
 * actions on them. The files are read and written by `model/store`; this
 * holds only what the view shows. Nothing is read until `enabled`, so a
 * project that never opens the canvas view never touches these files.
 */
export function useCanvases({
  api,
  folder,
  writable,
  enabled,
}: Options): CanvasesModel {
  const [status, setStatus] = useState<CanvasesModel["status"]>("idle");
  const [entries, setEntries] = useState<readonly CanvasEntry[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const newId = useMemo(
    () => createUlidGenerator(() => new Date(), browserRandomBytes),
    [],
  );

  // The folder the entries were read from, so a late answer for another project is ignored.
  const current = useRef(folder);
  useEffect(() => {
    current.current = folder;
  });

  const load = useCallback(async (): Promise<readonly CanvasEntry[] | null> => {
    const loaded = await loadCanvases(api, folder).catch(
      () => ({ ok: false, error: "unreadable" }) as const,
    );
    if (current.current !== folder) return null;
    if (!loaded.ok) {
      setStatus("failed");
      setNotice(canvasMessages.failures[loaded.error]);
      return null;
    }
    setEntries(loaded.value);
    setStatus("ready");
    // Keep the canvas being shown if it is still there, else the first.
    setSelectedName((name) =>
      loaded.value.some((entry) => entry.fileName === name)
        ? name
        : (loaded.value[0]?.fileName ?? null),
    );
    return loaded.value;
  }, [api, folder]);

  useEffect(() => {
    if (!enabled) return;
    setStatus("loading");
    void load();
  }, [enabled, load]);

  const selected =
    entries.find((entry) => entry.fileName === selectedName) ?? null;

  /** Runs one change, shows what went wrong, and reloads if the files moved underneath. */
  const act = useCallback(
    async <T>(
      change: () => Promise<CanvasResult<T>>,
      onDone: (value: T) => void,
    ): Promise<boolean> => {
      if (!writable) {
        setNotice(canvasMessages.failures.notWritable);
        return false;
      }
      setBusy(true);
      setNotice(null);
      try {
        const result = await change();
        if (!result.ok) {
          setNotice(canvasMessages.failures[result.error]);
          if (result.error === "changed" || result.error === "exists") {
            await load();
          }
          return false;
        }
        onDone(result.value);
        return true;
      } catch {
        setNotice(canvasMessages.failures.writeFailed);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [writable, load],
  );

  const create = useCallback(
    (name?: string) =>
      act(
        () =>
          createCanvas(api, folder, {
            id: newId(),
            name:
              name ??
              defaultCanvasName(
                entries.flatMap((entry) =>
                  entry.name === null ? [] : [entry.name],
                ),
              ),
          }),
        (entry) => {
          setEntries((previous) => sortEntries([...previous, entry]));
          setSelectedName(entry.fileName);
        },
      ),
    [act, api, folder, newId, entries],
  );

  const rename = useCallback(
    (name: string) => {
      if (selected === null) return Promise.resolve(false);
      return act(
        () => renameCanvas(api, folder, selected, name),
        (entry) =>
          setEntries((previous) =>
            sortEntries([
              ...previous.filter((e) => e.fileName !== entry.fileName),
              entry,
            ]),
          ),
      );
    },
    [act, api, folder, selected],
  );

  const remove = useCallback(() => {
    if (selected === null) return Promise.resolve(false);
    return act(
      () => deleteCanvas(api, folder, selected),
      () => {
        const rest = entries.filter((e) => e.fileName !== selected.fileName);
        setEntries(rest);
        setSelectedName(rest[0]?.fileName ?? null);
      },
    );
  }, [act, api, folder, selected, entries]);

  return {
    status,
    entries,
    selected,
    writable,
    busy,
    notice,
    select: setSelectedName,
    create,
    rename,
    remove,
    dismissNotice: () => setNotice(null),
  };
}
