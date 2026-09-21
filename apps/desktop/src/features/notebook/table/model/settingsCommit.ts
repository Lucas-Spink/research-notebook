import type { TableSettingsChange } from "@research-notebook/format";
import { mergeOverlay } from "./columns";

type Options = {
  /** How long a change waits for others before it is saved. */
  delayMs: number;
  /** Saves `change` in one write. Resolves whether it was saved. */
  commit: (change: TableSettingsChange) => Promise<boolean>;
  /** Called with everything not saved yet whenever it changes, for the table to show. */
  onUnsaved: (unsaved: TableSettingsChange) => void;
};

export type SettingsCommitter = {
  /**
   * Records a change. It is saved after `delayMs` with any others, or at once
   * with `immediate` (the end of a drag). With `persist: false`, as in a
   * read-only project, it is only kept for the session and never saved.
   */
  change(
    change: TableSettingsChange,
    options?: { persist?: boolean; immediate?: boolean },
  ): void;
  /** Saves what is waiting now, and resolves once it and any save under way are done. */
  flush(): Promise<void>;
  /** Forgets what is waiting and stops the timer, so nothing is saved to a project that has closed. */
  dispose(): void;
};

const isEmpty = (change: TableSettingsChange) =>
  Object.keys(change).length === 0;

/**
 * Coalesces changes to the table's layout into as few writes of
 * `project.yaml` as possible. Every save keeps a snapshot of the file it
 * replaces (ADR-0025), so a burst of collapses or a drag must not make one
 * each. Saves never overlap.
 */
export function createSettingsCommitter(options: Options): SettingsCommitter {
  let sessionOnly: TableSettingsChange = {};
  let pending: TableSettingsChange = {};
  let inFlight: TableSettingsChange = {};
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let disposed = false;

  const report = () =>
    options.onUnsaved(
      mergeOverlay(mergeOverlay(sessionOnly, inFlight), pending),
    );

  const stopTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };

  async function drain(): Promise<void> {
    while (!isEmpty(pending) && !disposed) {
      inFlight = pending;
      pending = {};
      report();
      try {
        await options.commit(inFlight);
      } catch {
        // A save that failed is dropped: the table then shows what is on disk.
      }
      inFlight = {};
      report();
    }
  }

  function flush(): Promise<void> {
    stopTimer();
    running ??= drain().finally(() => {
      running = null;
    });
    // A change made while a save was under way is picked up by the next drain.
    return running.then(() =>
      isEmpty(pending) || disposed ? undefined : flush(),
    );
  }

  return {
    change(change, { persist = true, immediate = false } = {}) {
      if (disposed) return;
      if (!persist) {
        sessionOnly = mergeOverlay(sessionOnly, change);
        report();
        return;
      }
      pending = mergeOverlay(pending, change);
      report();
      stopTimer();
      if (immediate) void flush();
      else timer = setTimeout(() => void flush(), options.delayMs);
    },
    flush,
    dispose() {
      disposed = true;
      stopTimer();
      pending = {};
    },
  };
}
