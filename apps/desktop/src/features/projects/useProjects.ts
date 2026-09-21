import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, type RecentEntry } from "../../ipc/bindings";
import { browserRandomBytes, createUlidGenerator } from "../../shared/ulid";
import { useExternalChanges, type Reload } from "../conflicts";
import type { ChangesPort } from "../notebook";
import { failureMessage, messages, warningMessage } from "./messages";
import {
  checkLockFlow,
  chooseExternalRootFlow,
  createFlow,
  externalRootsFlow,
  locateFlow,
  openFlow,
  openRecentFlow,
  releaseFlow,
  retryLockFlow,
  takeOverFlow,
  type ExternalRoot,
  type FlowOutcome,
  type OpenedProject,
} from "./model/flows";
import {
  PROJECT_YAML,
  reloadProjectFlow,
  seedProjectFile,
} from "./model/reload";

/**
 * How often an open, writable project is asked whether it still holds its
 * lock. Half the heartbeat interval, so a lock lost to another instance shows
 * as a banner well before anyone could be surprised by it.
 */
const LOCK_CHECK_MS = 30_000;

/**
 * State and actions for creating, opening and locating projects, and for the
 * lock on the open one. The steps themselves are in `model/`; this only holds
 * what the view shows.
 */
export function useProjects() {
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [opened, setOpened] = useState<OpenedProject | null>(null);
  const [roots, setRoots] = useState<ExternalRoot[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const env = useMemo(() => {
    const now = () => new Date();
    return { now, newId: createUlidGenerator(now, browserRandomBytes) };
  }, []);

  // The project as it is now, for work that finishes after it may have changed.
  const openedRef = useRef(opened);
  useEffect(() => {
    openedRef.current = opened;
  });

  /**
   * `project.yaml` changed outside the application: show what is on disk now
   * and decide the mode again. It has no editor, so there is nothing local to
   * conflict with. If the project changed while this ran, it is done again
   * on the newer one, once, so neither result is lost.
   */
  const reloadProjectFile = useCallback(
    async (file: Reload["file"], attempts = 2): Promise<void> => {
      const current = openedRef.current;
      if (current === null) return;
      const next = await reloadProjectFlow(commands, current, file);
      if (openedRef.current === current) setOpened(next);
      else if (attempts > 1) await reloadProjectFile(file, attempts - 1);
    },
    [],
  );

  // Other parts of the window that hold notebook files hear of outside changes too.
  const reloadListeners = useRef(new Set<(reload: Reload) => void>());

  const changes = useExternalChanges({
    folder: opened?.folder ?? null,
    onReload: (reload) => {
      reloadListeners.current.forEach((listener) => listener(reload));
      if (reload.path !== PROJECT_YAML) return;
      reloadProjectFile(reload.file).catch(() =>
        setNotices([messages.unexpected]),
      );
    },
  });
  const { track: trackFile, update, untrack } = changes;

  /** What the notebook needs from the watcher: which files it holds, and to hear of outside changes. */
  const fileChanges = useMemo<ChangesPort>(
    () => ({
      track: trackFile,
      update,
      untrack,
      onReload: (listener) => {
        reloadListeners.current.add(listener);
        return () => {
          reloadListeners.current.delete(listener);
        };
      },
    }),
    [trackFile, update, untrack],
  );

  // Hold project.yaml from what is on disk now. The project was opened a
  // moment ago, so it may already have changed.
  const openedFolder = opened?.folder ?? null;
  useEffect(() => {
    const project = openedRef.current;
    if (openedFolder === null || project === null) return;
    let cancelled = false;
    seedProjectFile(commands, project)
      .then((seed) => {
        if (cancelled || seed === null) return;
        trackFile(PROJECT_YAML, seed.base);
        if (seed.stale) return reloadProjectFile(seed.file);
      })
      // Not watching project.yaml is not worth interrupting for.
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [openedFolder, trackFile, reloadProjectFile]);

  const refreshRecent = useCallback(async () => {
    const listed = await commands.listRecentProjects();
    if (listed.status === "ok") setRecent(listed.data);
    else setNotices([failureMessage(listed.error.kind)]);
  }, []);

  useEffect(() => {
    void refreshRecent();
  }, [refreshRecent]);

  // A lock taken over by another instance turns the project read-only.
  useEffect(() => {
    if (opened === null || opened.mode.kind !== "writable") return;
    const timer = setInterval(() => {
      checkLockFlow(commands, opened)
        .then((checked) => {
          if (checked !== opened) {
            setOpened((current) => (current === opened ? checked : current));
          }
        })
        // A failed check changes nothing; the next one tries again.
        .catch(() => undefined);
    }, LOCK_CHECK_MS);
    return () => clearInterval(timer);
  }, [opened]);

  const show = useCallback(
    async (outcome: FlowOutcome) => {
      if (outcome.kind === "failed") {
        setNotices([failureMessage(outcome.reason)]);
      } else if (outcome.kind === "opened") {
        // Opening the same folder again keeps its lock; a different project
        // replaces the one shown, so the old one is released.
        if (opened !== null && opened.path !== outcome.project.path) {
          await releaseFlow(commands, opened);
        }
        setOpened(outcome.project);
        setNotices(outcome.warnings.map(warningMessage));
        setRoots(
          outcome.project.summary === null
            ? []
            : await externalRootsFlow(commands, outcome.project.summary),
        );
        await refreshRecent();
      }
    },
    [opened, refreshRecent],
  );

  /** Runs one action, showing that it is working and reporting anything unexpected. */
  const run = useCallback(
    async (action: () => Promise<FlowOutcome>) => {
      setBusy(true);
      setNotices([]);
      try {
        await show(await action());
      } catch {
        setNotices([messages.unexpected]);
      } finally {
        setBusy(false);
      }
    },
    [show],
  );

  /** Runs an action on the open project that may change its mode. */
  const changeMode = useCallback(
    async (action: (project: OpenedProject) => Promise<OpenedProject>) => {
      if (opened === null) return;
      setBusy(true);
      setNotices([]);
      try {
        setOpened(await action(opened));
      } catch {
        setNotices([messages.unexpected]);
      } finally {
        setBusy(false);
      }
    },
    [opened],
  );

  const chooseExternalRoot = useCallback(
    async (rootId: string) => {
      if (opened === null || opened.summary === null) return;
      setBusy(true);
      try {
        const chosen = await chooseExternalRootFlow(
          commands,
          opened.summary,
          rootId,
        );
        if (chosen === null) return;
        if ("failure" in chosen) setNotices([failureMessage(chosen.failure)]);
        else setRoots(chosen.roots);
      } catch {
        setNotices([messages.unexpected]);
      } finally {
        setBusy(false);
      }
    },
    [opened],
  );

  return {
    recent,
    opened,
    roots,
    notices: changes.watchFailed
      ? [...notices, failureMessage("watchFailed")]
      : notices,
    changed: changes.files,
    fileChanges,
    resolveConflict: changes.resolveConflict,
    busy,
    create: (name: string) => run(() => createFlow(commands, name, env)),
    open: () => run(() => openFlow(commands)),
    openRecent: (id: string) => run(() => openRecentFlow(commands, id)),
    locate: (id: string) => run(() => locateFlow(commands, id)),
    chooseExternalRoot,
    takeOver: () => changeMode((project) => takeOverFlow(commands, project)),
    retryLock: () => changeMode((project) => retryLockFlow(commands, project)),
  };
}
