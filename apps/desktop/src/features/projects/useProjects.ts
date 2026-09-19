import { useCallback, useEffect, useMemo, useState } from "react";
import { commands, type RecentEntry } from "../../ipc/bindings";
import { browserRandomBytes, createUlidGenerator } from "../../shared/ulid";
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
    notices,
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
