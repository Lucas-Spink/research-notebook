import {
  createExperiment,
  createQuestion,
  newProject,
  serialiseExperiment,
  serialiseProject,
  serialiseQuestion,
  type NotebookEnv,
  type NotebookState,
} from "@research-notebook/format";
import { createUlidGenerator } from "../../../shared/ulid";
import type {
  FileRead,
  FolderHandle,
  ProjectError,
  SaveResult,
} from "../../../ipc/bindings";
import type { Reload, Tracked } from "../../conflicts";
import { sha256Hex } from "../../../shared/sha256";
import type { ChangesPort, ReadApi, WriteApi } from "./api";

export const FOLDER: FolderHandle = 1;

type Failing = Extract<
  ProjectError,
  { kind: "fileUnavailable" | "writeFailed" | "notWritable" }
>;

/** A command's `ok` result, as a promise like the real one. */
const succeed = <T>(data: T) =>
  Promise.resolve({ status: "ok" as const, data });

/** A command's typed error, as a promise like the real one. */
const refuse = (error: Failing) =>
  Promise.resolve({ status: "error" as const, error });

/** The text of every file a state holds, by project-relative path. */
export function filesOf(state: NotebookState): Record<string, string> {
  const files: Record<string, string> = {
    "_notebook/project.yaml": serialiseProject(state.project),
  };
  for (const question of state.questions) {
    files[`_notebook/questions/${question.fileName}`] = serialiseQuestion(
      question.file,
    );
  }
  for (const experiment of state.experiments) {
    files[`_notebook/experiments/${experiment.folder}/experiment.md`] =
      serialiseExperiment(experiment.file);
  }
  return files;
}

/** What to make the fake fail or refuse, by path. */
export type Faults = {
  /** A write to this path fails with `writeFailed`. */
  failWrite: Set<string>;
  /** A write to this path finds it changed by someone else. */
  changed: Set<string>;
  /** A read of this path fails. */
  failRead: Set<string>;
  /** Writes and trashing are refused with `notWritable`. */
  notWritable: boolean;
  /** The version-change backup fails. */
  failBackup: boolean;
  /** Listing fails. */
  failList: boolean;
};

/**
 * An in-memory project that answers like the commands do: reads return text
 * and its hash, writes compare with what the caller expected and keep the
 * old text as a snapshot, and trashing moves files under `.trash/`. Every
 * call is recorded.
 */
export function fakeProject(initial: Record<string, string> = {}) {
  const disk: Record<string, string> = { ...initial };
  const calls: string[] = [];
  const faults: Faults = {
    failWrite: new Set(),
    changed: new Set(),
    failRead: new Set(),
    notWritable: false,
    failBackup: false,
    failList: false,
  };

  const hash = (path: string) => sha256Hex(disk[path] ?? "");

  const read: ReadApi = {
    listNotebookFiles: () => {
      calls.push("list");
      if (faults.failList) return refuse({ kind: "fileUnavailable" });
      const questionFiles = new Set<string>();
      const folders = new Set<string>();
      for (const path of Object.keys(disk)) {
        const question = /^_notebook\/questions\/([^/]+\.md)$/.exec(path);
        if (question?.[1] !== undefined) questionFiles.add(question[1]);
        const folder = /^_notebook\/experiments\/([^/]+)\//.exec(path);
        if (folder?.[1] !== undefined) folders.add(folder[1]);
      }
      return succeed({
        questionFiles: [...questionFiles].sort(),
        experimentFolders: [...folders].sort(),
      });
    },
    readNotebookFile: (_folder, path) => {
      calls.push(`read ${path}`);
      if (faults.failRead.has(path)) {
        return refuse({ kind: "fileUnavailable" });
      }
      const text = disk[path];
      return succeed<FileRead>(
        text === undefined
          ? { kind: "missing" }
          : { kind: "text", text, sha256: hash(path) },
      );
    },
  };

  const write: WriteApi = {
    writeNotebookFile: (_folder, path, text, expected) => {
      calls.push(`write ${path}`);
      if (faults.notWritable) return refuse({ kind: "notWritable" });
      if (faults.failWrite.has(path)) return refuse({ kind: "writeFailed" });
      const current = disk[path] === undefined ? null : hash(path);
      const matches =
        expected.kind === "absent"
          ? current === null
          : current === expected.sha256;
      if (faults.changed.has(path) || !matches) {
        return succeed<SaveResult>({ kind: "changed", current });
      }
      const snapshot =
        current === null ? null : `_notebook/.history/${path}/snapshot`;
      disk[path] = text;
      return succeed<SaveResult>({ kind: "saved", snapshot });
    },
    moveToTrash: (_folder, path) => {
      calls.push(`trash ${path}`);
      if (faults.notWritable) return refuse({ kind: "notWritable" });
      const moved = Object.keys(disk).filter(
        (key) => key === path || key.startsWith(`${path}/`),
      );
      if (moved.length === 0) return refuse({ kind: "writeFailed" });
      for (const key of moved) {
        disk[
          `_notebook/.trash/2026-09-21T10-15-00Z/${key.slice("_notebook/".length)}`
        ] = disk[key] ?? "";
        delete disk[key];
      }
      return succeed({ location: "_notebook/.trash/x" });
    },
    backupForVersionChange: () => {
      calls.push("backup");
      if (faults.failBackup) return refuse({ kind: "writeFailed" });
      return succeed({ folder: "_notebook/backups/x", copied: 1, skipped: 0 });
    },
  };

  return { disk, calls, faults, read, write, hash };
}

/**
 * A stand-in for the watcher's held files: the same tracker functions as the
 * real hook, so a test can report a change on disk and see whether the model
 * takes it for the application's own save.
 */
export function fakeChanges(): ChangesPort & {
  held: Record<string, Tracked>;
  handlers: Set<(reload: Reload) => void>;
  reloadAll: (reload: Reload) => void;
} {
  const held: Record<string, Tracked> = {};
  const handlers = new Set<(reload: Reload) => void>();
  return {
    held,
    handlers,
    reloadAll: (reload) => handlers.forEach((handler) => handler(reload)),
    track: (path, base) => {
      if (held[path] === undefined) {
        held[path] = { path, base, unsaved: null, saving: [], conflict: null };
      }
    },
    update: (path, change) => {
      const current = held[path];
      if (current !== undefined) held[path] = change(current);
    },
    untrack: (path) => {
      delete held[path];
    },
    onReload: (handler) => {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

/** A clock and identifiers that are the same on every run. */
export function testEnv(appVersion = "0.2.0"): NotebookEnv {
  let tick = 0;
  const now = () => new Date(Date.UTC(2026, 8, 21, 10, 0, tick++));
  const random = (length: number) =>
    Uint8Array.from({ length }, (_, i) => (tick * 7 + i) % 256);
  return { now, newId: createUlidGenerator(now, random), appVersion };
}

/**
 * A project written by `appVersion` with two questions, Q-001 holding
 * EXP-001 and EXP-002, made with the same operations the application uses.
 */
export function sampleNotebook(appVersion = "0.2.0") {
  const env = testEnv(appVersion);
  const created = newProject(
    { name: "Sample", appVersion },
    { now: env.now, newId: env.newId },
  );
  if (!created.ok) throw new Error("sample project");
  let state: NotebookState = {
    project: created.value.project,
    questions: [],
    experiments: [],
    reservedRefs: [],
    unreadable: [],
  };
  const next = (plan: ReturnType<typeof createQuestion>) => {
    if (!plan.ok) throw new Error(JSON.stringify(plan.error));
    state = plan.value.next;
  };
  next(createQuestion(state, { title: "First" }, env));
  next(createQuestion(state, { title: "Second" }, env));
  const [first, second] = state.questions.map((q) => q.file.frontmatter.id);
  if (first === undefined || second === undefined) throw new Error("sample");
  next(createExperiment(state, { questionId: first, title: "One" }, env));
  next(createExperiment(state, { questionId: first, title: "Two" }, env));
  const [one, two] = state.experiments.map((e) => e.file.frontmatter.id);
  if (one === undefined || two === undefined) throw new Error("sample");
  return { env, state, first, second, one, two };
}
