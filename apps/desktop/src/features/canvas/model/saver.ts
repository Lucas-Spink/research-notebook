import type { CanvasFileModel } from "@research-notebook/format";
import type { FolderHandle } from "../../../ipc/bindings";
import {
  saveCanvas,
  type CanvasApi,
  type CanvasEntry,
  type CanvasFailure,
} from "./store";

/** What became of a save, by canvas file. */
export type SaveReport = { fileName: string } & (
  { ok: true; entry: CanvasEntry } | { ok: false; error: CanvasFailure }
);

type Options = {
  api: CanvasApi;
  folder: FolderHandle;
  /** How long edits must be quiet before they are written. */
  delayMs: number;
  onReport: (report: SaveReport) => void;
};

export type CanvasSaver = {
  /**
   * The latest content of a canvas. The first call for a file also says what
   * was read, so the write expects it; later calls only replace the content.
   */
  queue: (entry: CanvasEntry, file: CanvasFileModel) => void;
  /** Writes whatever is waiting now. Resolves when nothing is waiting or running. */
  flush: () => Promise<void>;
  /** Forgets what is waiting for a file, such as after it was reloaded or deleted. */
  discard: (fileName: string) => void;
};

type Slot = {
  entry: CanvasEntry;
  pending: CanvasFileModel | null;
  timer: ReturnType<typeof setTimeout> | null;
  running: Promise<void> | null;
};

/**
 * Saves edits to canvases after a short quiet (a drag is one edit, but a pan
 * and a resize in quick succession should be one write), one canvas at a time
 * and in order. Every write is also a history snapshot, so writes are kept
 * few. A write expects the hash it last saw, so it never replaces a file
 * changed outside the application: that is reported once and the edit is let
 * go, for the person to see the file as it now is. A write that fails for any
 * other reason keeps its content for the next edit or flush; nothing retries
 * by itself.
 */
export function createCanvasSaver({
  api,
  folder,
  delayMs,
  onReport,
}: Options): CanvasSaver {
  const slots = new Map<string, Slot>();

  async function run(fileName: string, slot: Slot): Promise<void> {
    while (slot.pending !== null) {
      const file = slot.pending;
      slot.pending = null;
      const saved = await saveCanvas(api, folder, slot.entry, file).catch(
        () => ({ ok: false, error: "writeFailed" }) as const,
      );
      if (saved.ok) {
        slot.entry = saved.value;
        onReport({ fileName, ok: true, entry: saved.value });
        continue;
      }
      onReport({ fileName, ok: false, error: saved.error });
      if (saved.error === "changed") {
        slots.delete(fileName);
        return;
      }
      // Kept for the next edit or flush, unless a newer edit already arrived.
      slot.pending ??= file;
      return;
    }
  }

  function start(fileName: string, slot: Slot): Promise<void> {
    if (slot.timer !== null) {
      clearTimeout(slot.timer);
      slot.timer = null;
    }
    // A running save picks up what arrived meanwhile (its loop checks again).
    if (slot.running !== null) return slot.running;
    const running = run(fileName, slot).finally(() => {
      slot.running = null;
    });
    slot.running = running;
    return running;
  }

  return {
    queue(entry, file) {
      const slot = slots.get(entry.fileName) ?? {
        entry,
        pending: null,
        timer: null,
        running: null,
      };
      slots.set(entry.fileName, slot);
      slot.pending = file;
      if (slot.timer !== null) clearTimeout(slot.timer);
      slot.timer = setTimeout(() => {
        slot.timer = null;
        void start(entry.fileName, slot);
      }, delayMs);
    },
    async flush() {
      await Promise.all(
        [...slots].map(([fileName, slot]) =>
          slot.pending === null && slot.running === null
            ? Promise.resolve()
            : start(fileName, slot),
        ),
      );
    },
    discard(fileName) {
      const slot = slots.get(fileName);
      if (slot?.timer != null) clearTimeout(slot.timer);
      slots.delete(fileName);
    },
  };
}
