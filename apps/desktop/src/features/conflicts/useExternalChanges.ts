import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, type FolderHandle } from "../../ipc/bindings";
import {
  applyReport,
  recheck,
  type Files,
  type Reload,
  type Store,
} from "./model/session";
import {
  resolve,
  track as trackFile,
  type Keep,
  type Resolution,
  type Tracked,
} from "./model/tracker";

/** How often the watcher is asked what changed. */
const POLL_MS = 1_000;

type Options = {
  /** The project to watch, or `null` for none. */
  folder: FolderHandle | null;
  /** A file with no unsaved edits was replaced from disk; its owner should take it. */
  onReload: (reload: Reload) => void;
  /** The person chose a side of a conflict; the owner carries it out. */
  onResolved?: (path: string, resolution: Resolution) => void;
};

/**
 * Watches the open project for changes made outside the application and
 * applies them to the files registered here (FR-HIS-05). The steps
 * themselves are in `model/`; this holds the files, asks the watcher about
 * once a second, and reports back what the owners need to know.
 *
 * An owner registers a file with `track` and reports its edits and saves
 * with `update` (using `edit`, `saving`, `saved` and the like from
 * `model/tracker`). A file with unsaved edits is never replaced: an outside
 * change to it becomes a conflict in `files`, shown by `ConflictPanel`.
 */
export function useExternalChanges({ folder, onReload, onResolved }: Options) {
  const filesRef = useRef<Files>({});
  const retryRef = useRef<string[]>([]);
  const [files, setFiles] = useState<Files>({});
  const [watchFailed, setWatchFailed] = useState(false);

  // The latest callbacks, without restarting the watch when they change.
  const callbacks = useRef({ onReload, onResolved });
  useEffect(() => {
    callbacks.current = { onReload, onResolved };
  });

  // Every change is made to the latest state, never to a copy taken before a
  // read: the person may type while one is under way.
  const store = useMemo<Store>(
    () => ({
      get: () => filesRef.current,
      put: (path, tracked) => {
        filesRef.current = { ...filesRef.current, [path]: tracked };
        setFiles(filesRef.current);
      },
    }),
    [],
  );

  useEffect(() => {
    filesRef.current = {};
    retryRef.current = [];
    setFiles({});
    setWatchFailed(false);
    if (folder === null) return;
    let stopped = false;
    let running = false;

    void commands.startProjectWatch(folder).then((started) => {
      if (!stopped && started.status === "error") setWatchFailed(true);
    });

    async function round(project: FolderHandle) {
      const polled = await commands.pollProjectChanges(project);
      if (stopped || polled.status === "error") return;
      let report = polled.data;
      if (!report.watching) {
        // The watch stopped, so changes may have been missed: start it again
        // and look at everything.
        const restarted = await commands.startProjectWatch(project);
        if (restarted.status === "error") return;
        report = { ...report, watching: true, needsRescan: true };
      }
      const applied = await applyReport(commands, project, store, report);
      const again =
        retryRef.current.length > 0
          ? await recheck(commands, project, store, retryRef.current)
          : { reloads: [], retry: [] };
      retryRef.current = [...applied.retry, ...again.retry];
      for (const reload of [...again.reloads, ...applied.reloads]) {
        callbacks.current.onReload(reload);
      }
    }

    const timer = setInterval(() => {
      // One round at a time: a slow read must not be overtaken by the next.
      if (running) return;
      running = true;
      round(folder)
        // A failed round changes nothing; the next one tries again.
        .catch(() => undefined)
        .finally(() => {
          running = false;
        });
    }, POLL_MS);

    return () => {
      stopped = true;
      clearInterval(timer);
      void commands.stopProjectWatch(folder);
    };
  }, [folder, store]);

  /** Starts holding `path`, loaded from the disk version with hash `base` (`null`: no file). */
  const track = useCallback(
    (path: string, base: string | null) => {
      if (store.get()[path] === undefined)
        store.put(path, trackFile(path, base));
    },
    [store],
  );

  /** Changes what is held for `path`, from the latest state. Ignored if it is not held. */
  const update = useCallback(
    (path: string, change: (held: Tracked) => Tracked) => {
      const held = store.get()[path];
      if (held !== undefined) store.put(path, change(held));
    },
    [store],
  );

  /** Stops holding `path`. */
  const untrack = useCallback(
    (path: string) => {
      const rest = Object.fromEntries(
        Object.entries(store.get()).filter(([held]) => held !== path),
      );
      filesRef.current = rest;
      setFiles(rest);
    },
    [store],
  );

  /** Settles a conflict as the person chose, and tells the owner. */
  const resolveConflict = useCallback(
    (path: string, keep: Keep) => {
      const held = store.get()[path];
      if (held === undefined) return;
      const result = resolve(held, keep);
      store.put(path, result.tracked);
      callbacks.current.onResolved?.(path, result.resolution);
    },
    [store],
  );

  return { files, watchFailed, track, update, untrack, resolveConflict };
}
