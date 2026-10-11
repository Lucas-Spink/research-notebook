import type { CanvasFileModel } from "@research-notebook/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FolderHandle } from "../../ipc/bindings";
import { browserRandomBytes, createUlidGenerator } from "../../shared/ulid";
import { canvasMessages } from "./messages";
import { defaultCanvasName, sortEntries } from "./model/canvasFiles";
import { pinResults, pinnedIds, type PinRef, type Point } from "./model/nodes";
import { createCanvasSaver, type SaveReport } from "./model/saver";
import {
  createCanvas,
  deleteCanvas,
  loadCanvases,
  renameCanvas,
  type CanvasApi,
  type CanvasEntry,
  type CanvasResult,
} from "./model/store";

/** How long edits must be quiet before they are written; every write is also a history snapshot. */
const SAVE_DELAY_MS = 800;

type Options = {
  api: CanvasApi;
  folder: FolderHandle;
  /** Whether the project may be changed. Reading never needs it. */
  writable: boolean;
  /** Canvases are read only while the canvas view is showing. */
  enabled: boolean;
  /** Only tests set this. */
  saveDelayMs?: number;
};

/** What the drawn surface can say about where things are on screen (React Flow knows, not this hook). */
export type SurfaceBridge = {
  /** The canvas point under a point of the window. */
  toCanvas: (screen: Point) => Point;
  /** The canvas point in the middle of what is showing. */
  centre: () => Point;
};

/** What the canvas view shows and can ask for. */
export type CanvasesModel = {
  status: "idle" | "loading" | "ready" | "failed";
  entries: readonly CanvasEntry[];
  /** The canvas being shown, or `null` when there is none. */
  selected: CanvasEntry | null;
  writable: boolean;
  busy: boolean;
  notice: string | null;
  /** The results that have a card on the canvas being shown. */
  pinned: ReadonlySet<string>;
  select: (fileName: string) => void;
  /** Creates a canvas named `name` (a default one when omitted) and shows it. Resolves whether it was made. */
  create: (name?: string) => Promise<boolean>;
  /** Renames the canvas being shown. Resolves whether it was saved. */
  rename: (name: string) => Promise<boolean>;
  /** Moves the canvas being shown to the trash. Resolves whether it was moved. */
  remove: () => Promise<boolean>;
  /** Changes the canvas being shown and saves it after a short quiet. Does nothing when it cannot be changed. */
  edit: (change: (file: CanvasFileModel) => CanvasFileModel) => void;
  /**
   * Pins results to the canvas being shown, at a point of the window (a
   * drop) or, with `null`, in the middle of what is showing. Returns whether
   * anything was pinned; the results themselves are not touched.
   */
  pinAt: (refs: readonly PinRef[], screen: Point | null) => boolean;
  /** The drawn surface says where things are on screen while it is showing. */
  registerSurface: (bridge: SurfaceBridge | null) => void;
  /** Writes whatever is waiting to be saved now. */
  flush: () => Promise<void>;
  dismissNotice: () => void;
};

/**
 * The project's canvases (ADR-0064): which exist, which is shown, the edits
 * made to it, and the actions on them. The files are read and written by
 * `model/store`, edits are held back and written by `model/saver`; this holds
 * only what the view shows. Nothing is read until `enabled`, so a project
 * that never opens the canvas view never touches these files.
 */
export function useCanvases({
  api,
  folder,
  writable,
  enabled,
  saveDelayMs = SAVE_DELAY_MS,
}: Options): CanvasesModel {
  const [status, setStatus] = useState<CanvasesModel["status"]>("idle");
  const [entries, setEntriesState] = useState<readonly CanvasEntry[]>([]);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // The entries as they are now, readable between renders: an edit and the save report that follows it must see each other.
  const entriesRef = useRef<readonly CanvasEntry[]>([]);
  const setEntries = useCallback(
    (
      next:
        | readonly CanvasEntry[]
        | ((previous: readonly CanvasEntry[]) => readonly CanvasEntry[]),
    ) => {
      entriesRef.current =
        typeof next === "function" ? next(entriesRef.current) : next;
      setEntriesState(entriesRef.current);
    },
    [],
  );
  const selectedRef = useRef<string | null>(null);
  selectedRef.current = selectedName;

  const newId = useMemo(
    () => createUlidGenerator(() => new Date(), browserRandomBytes),
    [],
  );
  const bridge = useRef<SurfaceBridge | null>(null);

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
  }, [api, folder, setEntries]);

  useEffect(() => {
    if (!enabled) return;
    setStatus("loading");
    void load();
  }, [enabled, load]);

  const onReport = useRef<(report: SaveReport) => void>(() => undefined);
  onReport.current = (report) => {
    if (report.ok) {
      // Only the hash: the content in view may already be newer than what was written.
      setEntries((previous) =>
        previous.map((entry) =>
          entry.fileName === report.fileName
            ? { ...entry, sha256: report.entry.sha256 }
            : entry,
        ),
      );
      return;
    }
    setNotice(canvasMessages.failures[report.error]);
    // The file is not what was read: show it as it is now, not as it was edited.
    if (report.error === "changed") void load();
  };
  const saver = useMemo(
    () =>
      createCanvasSaver({
        api,
        folder,
        delayMs: saveDelayMs,
        onReport: (report) => onReport.current(report),
      }),
    [api, folder, saveDelayMs],
  );
  // Leaving the project saves what is waiting.
  useEffect(() => () => void saver.flush(), [saver]);

  const selected =
    entries.find((entry) => entry.fileName === selectedName) ?? null;

  /** Runs one change to the files, shows what went wrong, and reloads if they moved underneath. */
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
                entriesRef.current.flatMap((entry) =>
                  entry.name === null ? [] : [entry.name],
                ),
              ),
          }),
        (entry) => {
          setEntries((previous) => sortEntries([...previous, entry]));
          setSelectedName(entry.fileName);
        },
      ),
    [act, api, folder, newId, setEntries],
  );

  const rename = useCallback(
    async (name: string) => {
      const target = selectedRef.current;
      if (target === null) return false;
      // Edits waiting to be saved go first, so the rename expects the file as they left it.
      await saver.flush();
      const latest = entriesRef.current.find(
        (entry) => entry.fileName === target,
      );
      if (latest === undefined) return false;
      return act(
        () => renameCanvas(api, folder, latest, name),
        (entry) => {
          // The file has a new hash, so what the saver remembers of it is stale.
          saver.discard(entry.fileName);
          setEntries((previous) =>
            sortEntries([
              ...previous.filter((e) => e.fileName !== entry.fileName),
              entry,
            ]),
          );
        },
      );
    },
    [act, api, folder, saver, setEntries],
  );

  const remove = useCallback(() => {
    const target = entriesRef.current.find(
      (entry) => entry.fileName === selectedRef.current,
    );
    if (target === undefined) return Promise.resolve(false);
    saver.discard(target.fileName);
    return act(
      () => deleteCanvas(api, folder, target),
      () => {
        const rest = entriesRef.current.filter(
          (e) => e.fileName !== target.fileName,
        );
        setEntries(rest);
        setSelectedName(rest[0]?.fileName ?? null);
      },
    );
  }, [act, api, folder, saver, setEntries]);

  const edit = useCallback<CanvasesModel["edit"]>(
    (change) => {
      if (!writable) return;
      const target = entriesRef.current.find(
        (entry) => entry.fileName === selectedRef.current,
      );
      if (target?.file == null) return;
      const next = change(target.file);
      if (next === target.file) return;
      setEntries((previous) =>
        previous.map((entry) =>
          entry.fileName === target.fileName
            ? { ...entry, name: next.name, file: next }
            : entry,
        ),
      );
      saver.queue(target, next);
    },
    [writable, saver, setEntries],
  );

  const pinAt = useCallback<CanvasesModel["pinAt"]>(
    (refs, screen) => {
      const surface = bridge.current;
      const target = entriesRef.current.find(
        (entry) => entry.fileName === selectedRef.current,
      );
      if (refs.length === 0) return false;
      if (!writable) {
        setNotice(canvasMessages.failures.notWritable);
        return false;
      }
      if (surface === null || target?.file == null) {
        setNotice(canvasMessages.pinFailed);
        return false;
      }
      const at = screen === null ? surface.centre() : surface.toCanvas(screen);
      edit((file) => pinResults(file, refs, at, newId));
      return true;
    },
    [writable, edit, newId],
  );

  const registerSurface = useCallback((next: SurfaceBridge | null) => {
    bridge.current = next;
  }, []);

  const pinned = useMemo(
    () =>
      selected?.file == null ? new Set<string>() : pinnedIds(selected.file),
    [selected],
  );

  return {
    status,
    entries,
    selected,
    writable,
    busy,
    notice,
    pinned,
    select: setSelectedName,
    create,
    rename,
    remove,
    edit,
    pinAt,
    registerSurface,
    flush: () => saver.flush(),
    dismissNotice: () => setNotice(null),
  };
}
