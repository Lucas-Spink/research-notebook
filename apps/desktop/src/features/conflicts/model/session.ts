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

export type Applied = {
  files: Files;
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
 * Applies what the watcher found to the files the application holds. A
 * file with no unsaved edits is reloaded and its owner told; a file with
 * them is never replaced, and starts a conflict that holds both versions.
 * Nothing is written to disk, and `files` is not changed.
 *
 * `needsRescan` means events may have been lost, so every held file is
 * read and compared, not only those reported.
 */
export async function applyReport(
  api: Api,
  folder: FolderHandle,
  files: Files,
  report: ChangeReport,
): Promise<Applied> {
  const seen = new Map<string, Seen>();
  for (const change of report.changes) {
    seen.set(change.path, { disk: change.state, read: null });
  }
  const retry: string[] = [];
  if (report.needsRescan) {
    for (const path of Object.keys(files)) {
      if (seen.has(path)) continue;
      const found = await read(api, folder, path);
      if (!found.ok) retry.push(path);
      seen.set(path, { disk: diskOf(found), read: found });
    }
  }
  const applied = await apply(api, folder, files, seen);
  return { ...applied, retry: [...retry, ...applied.retry] };
}

/** Checks the named files again, for those a previous round could not read. */
export async function recheck(
  api: Api,
  folder: FolderHandle,
  files: Files,
  paths: readonly string[],
): Promise<Applied> {
  const seen = new Map<string, Seen>();
  const retry: string[] = [];
  for (const path of paths) {
    if (files[path] === undefined) continue;
    const found = await read(api, folder, path);
    if (!found.ok) retry.push(path);
    seen.set(path, { disk: diskOf(found), read: found });
  }
  const applied = await apply(api, folder, files, seen);
  return { ...applied, retry: [...retry, ...applied.retry] };
}

async function apply(
  api: Api,
  folder: FolderHandle,
  files: Files,
  seen: ReadonlyMap<string, Seen>,
): Promise<Applied> {
  const next: Record<string, Tracked> = { ...files };
  const reloads: Reload[] = [];
  const retry: string[] = [];
  for (const [path, { disk, read: known }] of seen) {
    const held = next[path];
    if (held === undefined) continue;
    const step = external(held, disk);
    let current = step.tracked;
    for (const effect of step.effects) {
      const found = known ?? (await read(api, folder, effect.path));
      if (!found.ok) {
        retry.push(path);
        continue;
      }
      if (effect.kind === "loadTheirs") {
        current = theirsLoaded(current, found.file);
        continue;
      }
      current = reloaded(current, found.file);
      // Typing that began after the change was reported makes it a conflict.
      if (current.conflict === null) reloads.push({ path, file: found.file });
    }
    next[path] = current;
  }
  return { files: next, reloads, retry };
}
