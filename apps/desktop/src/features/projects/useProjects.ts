import { useCallback, useEffect, useMemo, useState } from "react";
import { commands, type RecentEntry } from "../../ipc/bindings";
import { browserRandomBytes, createUlidGenerator } from "../../shared/ulid";
import { failureMessage, messages, warningMessage } from "./messages";
import {
  chooseExternalRootFlow,
  createFlow,
  externalRootsFlow,
  locateFlow,
  openFlow,
  openRecentFlow,
  type ExternalRoot,
  type FlowOutcome,
  type OpenedProject,
} from "./model/flows";

/**
 * State and actions for creating, opening and locating projects. The steps
 * themselves are in `model/flows.ts`; this only holds what the view shows.
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

  const show = useCallback(
    async (outcome: FlowOutcome) => {
      if (outcome.kind === "failed") {
        setNotices([failureMessage(outcome.reason)]);
      } else if (outcome.kind === "opened") {
        setOpened(outcome.project);
        setNotices(outcome.warnings.map(warningMessage));
        setRoots(await externalRootsFlow(commands, outcome.project.summary));
        await refreshRecent();
      }
    },
    [refreshRecent],
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

  const chooseExternalRoot = useCallback(
    async (rootId: string) => {
      if (opened === null) return;
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
  };
}
