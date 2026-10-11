import {
  parseCanvas,
  serialiseCanvas,
  type CanvasFileModel,
} from "@research-notebook/format";
import type {
  commands,
  FolderHandle,
  ProjectError,
} from "../../../ipc/bindings";
import { sha256Hex } from "../../../shared/sha256";
import {
  canvasName,
  canvasPathOfFile,
  newCanvasFile,
  renamed,
  sortEntries,
} from "./canvasFiles";

/** The commands the canvas files need, so tests can supply a fake with the same shape. */
export type CanvasApi = Pick<
  typeof commands,
  "listNotebookFiles" | "readNotebookFile" | "writeNotebookFile" | "moveToTrash"
>;

/**
 * One canvas file as read. `file` is `null` when it could not be read or did
 * not parse (including one from a newer format): it is then listed by its
 * file name, never rewritten, and can only be removed (AGENTS.md rule 5).
 */
export type CanvasEntry = {
  fileName: string;
  path: string;
  /** Hash of the bytes read, which a later save expects to still be on disk. */
  sha256: string;
  name: string | null;
  file: CanvasFileModel | null;
};

export type CanvasFailure =
  | "unreadable"
  | "invalidName"
  /** The canvas did not parse, so it is not changed. */
  | "invalid"
  /** The file was changed by something else; nothing was written. */
  | "changed"
  /** A file with that name is already there; nothing was written. */
  | "exists"
  | "notWritable"
  | "writeFailed";

export type CanvasResult<T> =
  { ok: true; value: T } | { ok: false; error: CanvasFailure };

const writeFailure = (error: ProjectError): CanvasFailure =>
  error.kind === "notWritable" ? "notWritable" : "writeFailed";

const unreadable = (fileName: string): CanvasEntry => ({
  fileName,
  path: canvasPathOfFile(fileName),
  sha256: "",
  name: null,
  file: null,
});

async function readEntry(
  api: CanvasApi,
  folder: FolderHandle,
  fileName: string,
): Promise<CanvasEntry | null> {
  const path = canvasPathOfFile(fileName);
  const read = await api.readNotebookFile(folder, path).catch(() => null);
  if (read === null || read.status === "error") return unreadable(fileName);
  // Gone since it was listed: nothing to show.
  if (read.data.kind === "missing") return null;
  const parsed = parseCanvas(read.data.text);
  return {
    fileName,
    path,
    sha256: read.data.sha256,
    name: parsed.ok ? parsed.value.name : null,
    file: parsed.ok ? parsed.value : null,
  };
}

/** Every canvas of the project, by name. Reads only; nothing is written. */
export async function loadCanvases(
  api: CanvasApi,
  folder: FolderHandle,
): Promise<CanvasResult<CanvasEntry[]>> {
  const listed = await api.listNotebookFiles(folder).catch(() => null);
  if (listed === null || listed.status === "error") {
    return { ok: false, error: "unreadable" };
  }
  const entries: CanvasEntry[] = [];
  for (const fileName of listed.data.canvasFiles) {
    const entry = await readEntry(api, folder, fileName);
    if (entry !== null) entries.push(entry);
  }
  return { ok: true, value: sortEntries(entries) };
}

/**
 * Writes a new, empty canvas named `name` as a file that must not exist yet,
 * so an existing canvas is never replaced. `id` comes from the caller's
 * generator, which keeps this deterministic in tests.
 */
export async function createCanvas(
  api: CanvasApi,
  folder: FolderHandle,
  input: { id: string; name: string },
): Promise<CanvasResult<CanvasEntry>> {
  const name = canvasName(input.name);
  if (!name.ok) return { ok: false, error: "invalidName" };
  const file = newCanvasFile(input.id, name.value);
  const text = serialiseCanvas(file);
  const fileName = `${input.id}.canvas.json`;
  const written = await api
    .writeNotebookFile(folder, canvasPathOfFile(fileName), text, {
      kind: "absent",
    })
    .catch(() => null);
  if (written === null) return { ok: false, error: "writeFailed" };
  if (written.status === "error") {
    return { ok: false, error: writeFailure(written.error) };
  }
  if (written.data.kind === "changed") return { ok: false, error: "exists" };
  return {
    ok: true,
    value: {
      fileName,
      path: canvasPathOfFile(fileName),
      sha256: sha256Hex(text),
      name: name.value,
      file,
    },
  };
}

/** Gives a canvas another name; everything else in the file is kept as it was. */
export async function renameCanvas(
  api: CanvasApi,
  folder: FolderHandle,
  entry: CanvasEntry,
  rawName: string,
): Promise<CanvasResult<CanvasEntry>> {
  if (entry.file === null) return { ok: false, error: "invalid" };
  const name = canvasName(rawName);
  if (!name.ok) return { ok: false, error: "invalidName" };
  const file = renamed(entry.file, name.value);
  const text = serialiseCanvas(file);
  const written = await api
    .writeNotebookFile(folder, entry.path, text, {
      kind: "sha256",
      sha256: entry.sha256,
    })
    .catch(() => null);
  if (written === null) return { ok: false, error: "writeFailed" };
  if (written.status === "error") {
    return { ok: false, error: writeFailure(written.error) };
  }
  if (written.data.kind === "changed") return { ok: false, error: "changed" };
  return {
    ok: true,
    value: { ...entry, sha256: sha256Hex(text), name: name.value, file },
  };
}

/** Moves a canvas to the trash, from where it can be restored by hand. Nothing else is touched. */
export async function deleteCanvas(
  api: CanvasApi,
  folder: FolderHandle,
  entry: CanvasEntry,
): Promise<CanvasResult<undefined>> {
  const moved = await api
    .moveToTrash(folder, entry.path, null)
    .catch(() => null);
  if (moved === null) return { ok: false, error: "writeFailed" };
  if (moved.status === "error") {
    return { ok: false, error: writeFailure(moved.error) };
  }
  return { ok: true, value: undefined };
}
