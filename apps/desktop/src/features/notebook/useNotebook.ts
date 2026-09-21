import {
  arrangeNotebook,
  createExperiment,
  createQuestion,
  editExperiment,
  editQuestion,
  moveExperiment,
  removeExperiment,
  removeQuestion,
  type Arranged,
  type ExperimentChanges,
  type NotebookEnv,
  type NotebookError,
  type NotebookState,
  type Plan,
  type Result,
} from "@research-notebook/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, type FolderHandle } from "../../ipc/bindings";
import { browserRandomBytes, createUlidGenerator } from "../../shared/ulid";
import { createFirstWriteGuard, type FirstWriteGuard } from "../history";
import { loadFailureMessage, messages, outcomeMessage } from "./messages";
import type { ChangesPort, Loaded } from "./model/api";
import { holdFiles } from "./model/held";
import { loadNotebook, type LoadFailure } from "./model/load";
import { perform } from "./model/perform";

type Options = {
  /** The open project, or `null` for none. */
  folder: FolderHandle | null;
  /** This window holds the project's lock. */
  writable: boolean;
  /** The watcher's held files, shared with the rest of the window. */
  changes: ChangesPort;
};

type View =
  | { status: "loading" }
  | { status: "failed"; reason: LoadFailure }
  | { status: "ready"; loaded: Loaded };

/** The operations the view can ask for. Each resolves `true` when it was carried out. */
export type NotebookActions = {
  createQuestion(title: string): Promise<boolean>;
  createExperiment(questionId: string, title: string): Promise<boolean>;
  editQuestion(id: string, title: string): Promise<boolean>;
  editExperiment(id: string, changes: ExperimentChanges): Promise<boolean>;
  moveExperiment(id: string, questionId: string): Promise<boolean>;
  removeExperiment(id: string): Promise<boolean>;
  removeQuestion(id: string): Promise<boolean>;
  refresh(): Promise<void>;
};

type Operation = (
  state: NotebookState,
  env: NotebookEnv,
) => Result<Plan, NotebookError>;

/**
 * The questions and experiments of the open project, and the operations on
 * them (FR-EXP-01 to 08). What each operation writes, and in which order, is
 * decided by `packages/format`; carrying it out safely is `model/perform`.
 * This holds what the view shows, runs one operation at a time, and reads the
 * disk again after anything that did not finish or that someone else changed.
 */
export function useNotebook({ folder, writable, changes }: Options) {
  const [view, setView] = useState<View>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const loadedRef = useRef<Loaded | null>(null);
  const guardRef = useRef<FirstWriteGuard | null>(null);
  const versionRef = useRef<string | null>(null);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const latest = useRef({ folder, writable, changes });
  useEffect(() => {
    latest.current = { folder, writable, changes };
  });

  const env = useMemo(() => {
    const now = () => new Date();
    return { now, newId: createUlidGenerator(now, browserRandomBytes) };
  }, []);

  const appVersion = useCallback(async () => {
    versionRef.current ??= await commands.appVersion();
    return versionRef.current;
  }, []);

  /** Reads the disk and holds what it finds, replacing what was held. */
  const reload = useCallback(async (): Promise<void> => {
    const { folder: project, changes: port } = latest.current;
    if (project === null) return;
    const result = await loadNotebook(commands, project);
    if (latest.current.folder !== project) return;
    const before = loadedRef.current;
    if (!result.ok) {
      loadedRef.current = null;
      setView({ status: "failed", reason: result.reason });
      return;
    }
    holdFiles(port, before?.hashes ?? {}, result.value.hashes);
    loadedRef.current = result.value;
    guardRef.current ??= createFirstWriteGuard(
      commands,
      project,
      result.value.state.project.last_written_by,
      await appVersion(),
    );
    setView({ status: "ready", loaded: result.value });
  }, [appVersion]);

  /** Runs `task` after any that are already under way, so writes never overlap. */
  const enqueue = useCallback(<T>(task: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.then(task, task);
    queueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const run = useCallback(
    (operation: Operation): Promise<boolean> =>
      enqueue(async () => {
        const {
          folder: project,
          writable: canWrite,
          changes: port,
        } = latest.current;
        const loaded = loadedRef.current;
        const guard = guardRef.current;
        if (project === null || loaded === null || guard === null) return false;
        setBusy(true);
        setNotice(null);
        try {
          const version = await appVersion();
          const done = await perform(
            {
              api: commands,
              folder: project,
              guard,
              changes: port,
              writable: canWrite,
            },
            loaded,
            (state) => operation(state, { ...env, appVersion: version }),
          );
          if (done.kind === "done") {
            loadedRef.current = done.loaded;
            setView({ status: "ready", loaded: done.loaded });
            return true;
          }
          setNotice(outcomeMessage(done));
          // What was written may differ from what is held: read it back.
          const gone =
            done.kind === "refused" && done.error.kind === "notFound";
          if (done.kind === "interrupted" || gone) await reload();
          return false;
        } catch {
          setNotice(messages.unexpected);
          await reload().catch(() => undefined);
          return false;
        } finally {
          setBusy(false);
        }
      }),
    [appVersion, enqueue, env, reload],
  );

  // Load when a project opens, and forget everything when it closes.
  useEffect(() => {
    loadedRef.current = null;
    guardRef.current = null;
    setView({ status: "loading" });
    setNotice(null);
    if (folder === null) return;
    let stale = false;
    void enqueue(async () => {
      if (!stale) await reload();
    }).catch(() => {
      if (!stale) setView({ status: "failed", reason: "unavailable" });
    });
    return () => {
      stale = true;
    };
  }, [folder, enqueue, reload]);

  // A file the notebook holds was changed by someone else: read everything again.
  useEffect(() => {
    if (folder === null) return;
    return changes.onReload(() => {
      void enqueue(reload).catch(() => undefined);
    });
  }, [folder, changes, enqueue, reload]);

  const state = view.status === "ready" ? view.loaded.state : null;
  const arranged: Arranged | null = useMemo(
    () => (state === null ? null : arrangeNotebook(state)),
    [state],
  );

  const actions: NotebookActions = useMemo(
    () => ({
      createQuestion: (title) => run((s, e) => createQuestion(s, { title }, e)),
      createExperiment: (questionId, title) =>
        run((s, e) => createExperiment(s, { questionId, title }, e)),
      editQuestion: (id, title) =>
        run((s, e) => editQuestion(s, id, { title }, e)),
      editExperiment: (id, changed) =>
        run((s, e) => editExperiment(s, id, changed, e)),
      moveExperiment: (id, questionId) =>
        run((s, e) => moveExperiment(s, id, questionId, e)),
      removeExperiment: (id) => run((s, e) => removeExperiment(s, id, e)),
      removeQuestion: (id) => run((s, e) => removeQuestion(s, id, e)),
      refresh: () =>
        enqueue(reload).catch(() => setNotice(messages.unexpected)),
    }),
    [run, enqueue, reload],
  );

  return {
    view,
    arranged,
    busy,
    writable,
    notice,
    failure: view.status === "failed" ? loadFailureMessage(view.reason) : null,
    actions,
  };
}

/** What `useNotebook` gives the view. */
export type NotebookModel = ReturnType<typeof useNotebook>;
