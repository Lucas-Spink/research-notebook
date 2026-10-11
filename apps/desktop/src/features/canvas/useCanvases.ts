import type { CanvasFileModel } from "@research-notebook/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FolderHandle } from "../../ipc/bindings";
import { browserRandomBytes, createUlidGenerator } from "../../shared/ulid";
import { canvasMessages } from "./messages";
import { addNote } from "./model/notes";
import { pinResults, pinnedIds, type PinRef, type Point } from "./model/nodes";
import { createCanvasSaver, type SaveReport } from "./model/saver";
import {
  canvasEntryOf,
  loadCanvases,
  type CanvasApi,
  type CanvasEntry,
} from "./model/store";

/** How long edits must be quiet before they are written; every write is also a history snapshot. */
const SAVE_DELAY_MS = 800;

/** The question whose canvas is showing: its id names the canvas file, its name labels a new one. */
export type CanvasQuestion = { id: string; name: string };

type Options = {
  api: CanvasApi;
  folder: FolderHandle;
  /** Whether the project may be changed. Reading never needs it. */
  writable: boolean;
  /** Canvases are read only while something that shows them is showing. */
  enabled: boolean;
  /** The question whose canvas to show, or `null` when there is none. */
  question: CanvasQuestion | null;
  /** Only tests set this. */
  saveDelayMs?: number;
};

/** What the drawn surface can say and do about where things are on screen (React Flow knows, not this hook). */
export type SurfaceBridge = {
  /** The canvas point under a point of the window. */
  toCanvas: (screen: Point) => Point;
  /** The canvas point in the middle of what is showing. */
  centre: () => Point;
  /** Selects a card and brings it into view. */
  focusNode: (id: string) => void;
};

/** What the canvas view shows and can ask for. */
export type CanvasesModel = {
  status: "idle" | "loading" | "ready" | "failed";
  /** The question's canvas: its file, or an empty one not written yet; `null` with no question. */
  current: CanvasEntry | null;
  writable: boolean;
  notice: string | null;
  /** The results that have a card on the canvas being shown. */
  pinned: ReadonlySet<string>;
  /** Makes an id for a new card or line. */
  newId: () => string;
  /** Changes the canvas being shown and saves it after a short quiet. Does nothing when it cannot be changed. */
  edit: (change: (file: CanvasFileModel) => CanvasFileModel) => void;
  /**
   * Pins results to the canvas being shown, at a point of the window (a
   * drop) or, with `null`, in the middle of what is showing. Returns whether
   * anything was pinned; the results themselves are not touched.
   */
  pinAt: (refs: readonly PinRef[], screen: Point | null) => boolean;
  /** Adds an empty note in the middle of what is showing and selects it. Returns its id, or `null` when it could not be added. */
  addNote: () => string | null;
  /** Selects a card and brings it into view. */
  focusNode: (id: string) => void;
  /** The drawn surface says where things are on screen while it is showing. */
  registerSurface: (bridge: SurfaceBridge | null) => void;
  /** Writes whatever is waiting to be saved now. */
  flush: () => Promise<void>;
  dismissNotice: () => void;
};

/**
 * The canvas of one question (ADR-0065) and the edits made to it. The files
 * are read by `model/store`, edits are held back and written by
 * `model/saver`; this holds only what the view shows. A question's canvas is
 * made, as a file, by the first change to it. Nothing is read until
 * `enabled`, so a project that never opens a canvas never touches these files.
 */
export function useCanvases({
  api,
  folder,
  writable,
  enabled,
  question,
  saveDelayMs = SAVE_DELAY_MS,
}: Options): CanvasesModel {
  const [status, setStatus] = useState<CanvasesModel["status"]>("idle");
  const [entries, setEntriesState] = useState<readonly CanvasEntry[]>([]);
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
  const questionRef = useRef(question);
  questionRef.current = question;

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

  const load = useCallback(async () => {
    const loaded = await loadCanvases(api, folder).catch(
      () => ({ ok: false, error: "unreadable" }) as const,
    );
    if (current.current !== folder) return;
    if (!loaded.ok) {
      setStatus("failed");
      setNotice(canvasMessages.failures[loaded.error]);
      return;
    }
    setEntries(loaded.value);
    setStatus("ready");
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

  const shown = question === null ? null : canvasEntryOf(entries, question);

  const edit = useCallback<CanvasesModel["edit"]>(
    (change) => {
      const asked = questionRef.current;
      if (!writable || asked === null) return;
      const target = canvasEntryOf(entriesRef.current, asked);
      if (target.file === null) return;
      const next = change(target.file);
      if (next === target.file) return;
      const updated: CanvasEntry = { ...target, name: next.name, file: next };
      setEntries((previous) =>
        previous.some((entry) => entry.fileName === target.fileName)
          ? previous.map((entry) =>
              entry.fileName === target.fileName ? updated : entry,
            )
          : [...previous, updated],
      );
      saver.queue(target, next);
    },
    [writable, saver, setEntries],
  );

  /** Where a new card goes, or why it cannot: the surface, and a canvas that can be changed. */
  const place = useCallback((): SurfaceBridge | null => {
    const asked = questionRef.current;
    const surface = bridge.current;
    if (!writable) {
      setNotice(canvasMessages.failures.notWritable);
      return null;
    }
    if (
      surface === null ||
      asked === null ||
      canvasEntryOf(entriesRef.current, asked).file === null
    ) {
      setNotice(canvasMessages.pinFailed);
      return null;
    }
    return surface;
  }, [writable]);

  const pinAt = useCallback<CanvasesModel["pinAt"]>(
    (refs, screen) => {
      if (refs.length === 0) return false;
      const surface = place();
      if (surface === null) return false;
      const at = screen === null ? surface.centre() : surface.toCanvas(screen);
      edit((file) => pinResults(file, refs, at, newId));
      return true;
    },
    [place, edit, newId],
  );

  const addNoteHere = useCallback<CanvasesModel["addNote"]>(() => {
    const surface = place();
    if (surface === null) return null;
    const id = newId();
    edit((file) => addNote(file, surface.centre(), () => id));
    return id;
  }, [place, edit, newId]);

  const registerSurface = useCallback((next: SurfaceBridge | null) => {
    bridge.current = next;
  }, []);

  const focusNode = useCallback(
    (id: string) => bridge.current?.focusNode(id),
    [],
  );

  const pinned = useMemo(
    () => (shown?.file == null ? new Set<string>() : pinnedIds(shown.file)),
    [shown],
  );

  return {
    status,
    current: shown,
    writable,
    notice,
    pinned,
    newId,
    edit,
    pinAt,
    addNote: addNoteHere,
    focusNode,
    registerSurface,
    flush: () => saver.flush(),
    dismissNotice: () => setNotice(null),
  };
}
