import {
  COLUMN_KEYS,
  DEFAULT_COLUMN_WIDTHS,
  arrangeNotebook,
  changeTableSettings,
  createExperiment,
  createQuestion,
  editExperiment,
  editExperimentSection as editSectionText,
  editQuestion,
  moveExperiment,
  removeExperiment,
  removeQuestion,
  resetTableColumns,
  type Arranged,
  type ExperimentChanges,
  type NotebookEnv,
  type NotebookError,
  type NotebookState,
  type Plan,
  type RecognisedSectionKey,
  type Result,
  type TableSettingsChange,
} from "@research-notebook/format";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { commands, type FolderHandle } from "../../ipc/bindings";
import { browserRandomBytes, createUlidGenerator } from "../../shared/ulid";
import { createFirstWriteGuard, type FirstWriteGuard } from "../history";
import type { AutosaveOutcome } from "./expanded/model/autosave";
import { loadFailureMessage, messages, outcomeMessage } from "./messages";
import type { ChangesPort, Loaded } from "./model/api";
import { holdFiles } from "./model/held";
import type { Performed } from "./model/perform";
import { perform } from "./model/perform";
import { withOverlay } from "./table/model/columns";
import {
  createSettingsCommitter,
  type SettingsCommitter,
} from "./table/model/settingsCommit";
import { loadNotebook, type LoadFailure } from "./model/load";

/** What `run` resolves to: a `perform()` outcome, or a genuinely unexpected exception. */
type RunOutcome = Performed | { kind: "unexpected" };

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

/**
 * How long a change to the table's layout waits for others before it is
 * saved. Every save keeps a snapshot (ADR-0025), so a burst is one write.
 */
export const SETTINGS_DELAY_MS = 1000;

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
  /**
   * Saves one recognised section's text (FR-EDT-03), the expanded view's
   * autosave. Resolves whether it was saved, and a message when it was not.
   */
  editExperimentSection(
    id: string,
    key: RecognisedSectionKey,
    text: string,
  ): Promise<AutosaveOutcome>;
  /** Changes the table's layout. Saved after a short wait, or at once with `immediate`; only kept for the session in a read-only project. */
  changeSettings(
    change: TableSettingsChange,
    options?: { immediate?: boolean },
  ): void;
  /** Puts every column back to its default width and visibility. */
  resetColumns(): void;
  /** Collapses or expands the Unassigned group, which has no ID to store, for this session. */
  setUnassignedCollapsed(collapsed: boolean): void;
};

type Operation = (
  state: NotebookState,
  env: NotebookEnv,
) => Result<Plan, NotebookError>;

const isDone = (done: RunOutcome) => done.kind === "done";

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
  // Layout changes not saved yet, shown at once, and the Unassigned group's own collapse.
  const [unsaved, setUnsaved] = useState<TableSettingsChange>({});
  const [unassignedCollapsed, setUnassignedCollapsed] = useState(false);
  const committerRef = useRef<SettingsCommitter | null>(null);

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
    (
      operation: Operation,
      // A save of the layout or of section text is not something the person
      // waits on, and its own status (not the shared notice) says how it went.
      {
        quiet = false,
        silent = false,
      }: { quiet?: boolean; silent?: boolean } = {},
    ): Promise<RunOutcome> =>
      enqueue(async (): Promise<RunOutcome> => {
        const {
          folder: project,
          writable: canWrite,
          changes: port,
        } = latest.current;
        const loaded = loadedRef.current;
        const guard = guardRef.current;
        if (project === null || loaded === null || guard === null) {
          return { kind: "unexpected" };
        }
        if (!quiet) {
          setBusy(true);
          setNotice(null);
        }
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
            return done;
          }
          if (!silent) setNotice(outcomeMessage(done));
          // What was written may differ from what is held: read it back.
          const gone =
            done.kind === "refused" && done.error.kind === "notFound";
          if (done.kind === "interrupted" || gone) await reload();
          return done;
        } catch {
          if (!silent) setNotice(messages.unexpected);
          await reload().catch(() => undefined);
          return { kind: "unexpected" };
        } finally {
          if (!quiet) setBusy(false);
        }
      }),
    [appVersion, enqueue, env, reload],
  );

  // Layout changes are coalesced into few writes; a new one for each project.
  useEffect(() => {
    const committer = createSettingsCommitter({
      delayMs: SETTINGS_DELAY_MS,
      commit: (change) =>
        run((s, e) => changeTableSettings(s, change, e), { quiet: true }).then(
          (done) => done.kind === "done",
        ),
      onUnsaved: setUnsaved,
    });
    committerRef.current = committer;
    return () => {
      committer.dispose();
      committerRef.current = null;
      setUnsaved({});
      setUnassignedCollapsed(false);
    };
  }, [folder, run]);

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
      createQuestion: (title) =>
        run((s, e) => createQuestion(s, { title }, e)).then(isDone),
      createExperiment: (questionId, title) =>
        run((s, e) => createExperiment(s, { questionId, title }, e)).then(
          isDone,
        ),
      editQuestion: (id, title) =>
        run((s, e) => editQuestion(s, id, { title }, e)).then(isDone),
      editExperiment: (id, changed) =>
        run((s, e) => editExperiment(s, id, changed, e)).then(isDone),
      moveExperiment: (id, questionId) =>
        run((s, e) => moveExperiment(s, id, questionId, e)).then(isDone),
      removeExperiment: (id) =>
        run((s, e) => removeExperiment(s, id, e)).then(isDone),
      removeQuestion: (id) =>
        run((s, e) => removeQuestion(s, id, e)).then(isDone),
      refresh: () =>
        enqueue(reload).catch(() => setNotice(messages.unexpected)),
      editExperimentSection: (id, key, text) =>
        run((s, e) => editSectionText(s, id, key, text, e), {
          quiet: true,
          silent: true,
        }).then((done): AutosaveOutcome => {
          if (done.kind === "done") return { ok: true };
          const message = outcomeMessage(done);
          return { ok: false, message: message ?? messages.unexpected };
        }),
      changeSettings: (change, { immediate = false } = {}) =>
        committerRef.current?.change(change, {
          persist: latest.current.writable,
          immediate,
        }),
      resetColumns: () => {
        const committer = committerRef.current;
        // Anything waiting would otherwise be saved after, and undo, the reset.
        committer?.discard();
        if (latest.current.writable) {
          void run((s, e) => resetTableColumns(s, e), { quiet: true });
        } else {
          committer?.change(
            {
              widths: DEFAULT_COLUMN_WIDTHS,
              hidden: Object.fromEntries(COLUMN_KEYS.map((k) => [k, false])),
            },
            { persist: false },
          );
        }
      },
      setUnassignedCollapsed,
    }),
    [run, enqueue, reload],
  );

  const table = useMemo(
    () => (state === null ? null : withOverlay(state.project.table, unsaved)),
    [state, unsaved],
  );

  return {
    view,
    arranged,
    /** The table's layout: what `project.yaml` holds, with changes not saved yet applied. */
    table,
    unassignedCollapsed,
    busy,
    writable,
    notice,
    failure: view.status === "failed" ? loadFailureMessage(view.reason) : null,
    actions,
  };
}

/** What `useNotebook` gives the view. */
export type NotebookModel = ReturnType<typeof useNotebook>;
