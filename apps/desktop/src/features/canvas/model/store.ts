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
import { canvasFileName, canvasPathOfFile, newCanvasFile } from "./canvasFiles";

/** The commands the canvas files need, so tests can supply a fake with the same shape. */
export type CanvasApi = Pick<
  typeof commands,
  "listNotebookFiles" | "readNotebookFile" | "writeNotebookFile"
>;

/**
 * One canvas file. `file` is `null` when it could not be read or did not parse
 * (including one from a newer format): it is then never rewritten (AGENTS.md
 * rule 5). `sha256` is the hash of the bytes read, which a later save expects
 * to still be on disk, or `null` for a canvas that has not been written yet.
 */
export type CanvasEntry = {
  fileName: string;
  path: string;
  sha256: string | null;
  name: string | null;
  file: CanvasFileModel | null;
};

export type CanvasFailure =
  | "unreadable"
  /** The canvas did not parse, so it is not changed. */
  | "invalid"
  /** The file was changed by something else, or appeared meanwhile; nothing was written. */
  | "changed"
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

/** Every canvas file of the project. Reads only; nothing is written. */
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
  return { ok: true, value: entries };
}

/**
 * A question's canvas (ADR-0065): the file named by its id if there is one, as
 * it was read, else an empty canvas that is not on disk yet and is written on
 * its first change. A file that did not parse is returned as it is, so it is
 * shown and left alone.
 */
export function canvasEntryOf(
  entries: readonly CanvasEntry[],
  question: { id: string; name: string },
): CanvasEntry {
  const fileName = canvasFileName(question.id);
  const found = entries.find((entry) => entry.fileName === fileName);
  if (found !== undefined) return found;
  return {
    fileName,
    path: canvasPathOfFile(fileName),
    sha256: null,
    name: question.name,
    file: newCanvasFile(question.id, question.name),
  };
}

/**
 * Saves `file` over the canvas `entry` was read from, expecting the file on
 * disk to still be what was read, or not to exist yet for a new one. If
 * something else changed it, nothing is written (`changed`): a save never
 * overwrites an outside edit.
 */
export async function saveCanvas(
  api: CanvasApi,
  folder: FolderHandle,
  entry: CanvasEntry,
  file: CanvasFileModel,
): Promise<CanvasResult<CanvasEntry>> {
  if (entry.file === null) return { ok: false, error: "invalid" };
  const text = serialiseCanvas(file);
  const written = await api
    .writeNotebookFile(
      folder,
      entry.path,
      text,
      entry.sha256 === null
        ? { kind: "absent" }
        : { kind: "sha256", sha256: entry.sha256 },
    )
    .catch(() => null);
  if (written === null) return { ok: false, error: "writeFailed" };
  if (written.status === "error") {
    return { ok: false, error: writeFailure(written.error) };
  }
  if (written.data.kind === "changed") return { ok: false, error: "changed" };
  return {
    ok: true,
    value: { ...entry, sha256: sha256Hex(text), name: file.name, file },
  };
}
