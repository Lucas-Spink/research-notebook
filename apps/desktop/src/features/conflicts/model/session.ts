import type {
  ChangeReport,
  commands,
  FolderHandle,
} from "../../../ipc/bindings";
import {
  external,
  reloaded,
  theirsLoaded,
  type Disk,
  type FileText,
  type Tracked,
} from "./tracker";

/** The one command the session calls, so tests can supply a fake with its shape. */
export type Api = Pick<typeof commands, "readNotebookFile">;

/** The files the application holds in memory, by project-relative path. */
export type Files = Readonly<Record<string, Tracked>>;

/** A file replaced from disk while it had no unsaved edits. */
export type Reload = {
  path: string;
  /** What is on disk now, or `null` if the file was removed. */
  file: FileText | null;
};

/**
 * The files the application holds, read and changed one at a time. Every
 * change is made to the latest state, not to a copy taken earlier, because
 * reads take time and the person may type while they are under way: putting
 * a stale copy back would erase what they typed. `get` and `put` are
 * synchronous, so a read-modify-write pair in one step cannot be interleaved.
 */
export type Store = {
  get(): Files;
  put(path: string, tracked: Tracked): void;
};

export type Applied = {
  /** For each file's owner to take: the buffer should now hold this. */
  reloads: Reload[];
  /**
   * Files that could not be read this time. The change is not reported
   * again, so the caller asks for these to be checked on its next round.
   */
  retry: string[];
};

/** What one read of a file found; `null` file means there is none. */
type Read = { ok: true; file: FileText | null } | { ok: false };

async function read(
  api: Api,
  folder: FolderHandle,
  path: string,
): Promise<Read> {
  const result = await api.readNotebookFile(folder, path);
  if (result.status === "error") return { ok: false };
  const data = result.data;
  return data.kind === "text"
    ? { ok: true, file: { text: data.text, sha256: data.sha256 } }
    : { ok: true, file: null };
}

/** What the disk holds, from a read, in the terms the model uses. */
function diskOf(read: Read): Disk {
  if (!read.ok) return { kind: "unreadable" };
  return read.file === null
    ? { kind: "missing" }
    : { kind: "present", sha256: read.file.sha256 };
}

/** A change to look at: what the disk holds, and the read it came from, if any. */
type Seen = { disk: Disk; read: Read | null };

/**
 * Applies what the watcher found to the files in `store`. A file with no
 * unsaved edits is reloaded and its owner told; a file with them is never
 * replaced, and starts a conflict that holds both versions. Nothing is
 * written to disk.
 *
 * `needsRescan` means events may have been lost, so every held file is
 * read and compared, not only those reported.
 */
export async function applyReport(
  api: Api,
  folder: FolderHandle,
  store: Store,
  report: ChangeReport,
): Promise<Applied> {
  const seen = new Map<string, Seen>();
  for (const change of report.changes) {
    seen.set(change.path, { disk: change.state, read: null });
  }
  const retry: string[] = [];
  if (report.needsRescan) {
    for (const path of Object.keys(store.get())) {
      if (!seen.has(path)) await look(api, folder, path, seen, retry);
    }
  }
  const applied = await apply(api, folder, store, seen);
  return { ...applied, retry: [...retry, ...applied.retry] };
}

/** Checks the named files again, for those a previous round could not read. */
export async function recheck(
  api: Api,
  folder: FolderHandle,
  store: Store,
  paths: readonly string[],
): Promise<Applied> {
  const seen = new Map<string, Seen>();
  const retry: string[] = [];
  for (const path of paths) {
    if (store.get()[path] !== undefined) {
      await look(api, folder, path, seen, retry);
    }
  }
  const applied = await apply(api, folder, store, seen);
  return { ...applied, retry: [...retry, ...applied.retry] };
}

/** Reads `path` to see what is on disk, noting it for a retry if it cannot be read. */
async function look(
  api: Api,
  folder: FolderHandle,
  path: string,
  seen: Map<string, Seen>,
  retry: string[],
): Promise<void> {
  const found = await read(api, folder, path);
  if (!found.ok) retry.push(path);
  seen.set(path, { disk: diskOf(found), read: found });
}

async function apply(
  api: Api,
  folder: FolderHandle,
  store: Store,
  seen: ReadonlyMap<string, Seen>,
): Promise<Applied> {
  const reloads: Reload[] = [];
  const retry: string[] = [];
  for (const [path, { disk, read: known }] of seen) {
    const held = store.get()[path];
    if (held === undefined) continue;
    const step = external(held, disk);
    store.put(path, step.tracked);
    for (const effect of step.effects) {
      const found = known ?? (await read(api, folder, effect.path));
      if (!found.ok) {
        retry.push(path);
        continue;
      }
      // The read took time: work from the state as it is now.
      const current = store.get()[path];
      if (current === undefined) continue;
      if (effect.kind === "loadTheirs") {
        store.put(path, theirsLoaded(current, found.file));
        continue;
      }
      const after = reloaded(current, found.file);
      store.put(path, after);
      // Typing that began after the change was reported makes it a conflict.
      if (after.conflict === null) reloads.push({ path, file: found.file });
    }
  }
  return { reloads, retry };
}
