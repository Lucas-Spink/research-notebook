import { serialiseCanvas } from "@research-notebook/format";
import { sha256Hex } from "../../../shared/sha256";
import { canvasPathOfFile, newCanvasFile } from "./canvasFiles";
import type { CanvasApi } from "./store";

/** An in-memory project for the canvas tests: the commands the store uses, over a map of files. */

export const FOLDER = 5;
export const A = "01JAXC0000000000000000CNV1";
export const B = "01JAXC0000000000000000CNV2";
export const fileOf = (id: string) => `${id}.canvas.json`;
export const pathOf = (id: string) => canvasPathOfFile(fileOf(id));
export const textOf = (id: string, name: string) =>
  serialiseCanvas(newCanvasFile(id, name));

export type Faults = {
  writable?: boolean;
  list?: boolean;
  read?: string[];
  write?: "error";
  trash?: "error";
};

export function fakeApi(initial: Record<string, string>, faults: Faults = {}) {
  const disk: Record<string, string> = { ...initial };
  const trashed: string[] = [];
  const writes: string[] = [];
  const api = {
    listNotebookFiles: () =>
      Promise.resolve(
        faults.list === true
          ? { status: "error", error: { kind: "fileUnavailable" } }
          : {
              status: "ok",
              data: {
                questionFiles: [],
                experimentFolders: [],
                canvasFiles: Object.keys(disk)
                  .filter((path) => path.startsWith("_notebook/canvases/"))
                  .map((path) => path.slice("_notebook/canvases/".length))
                  .sort(),
              },
            },
      ),
    readNotebookFile: (_folder: unknown, path: string) => {
      if (faults.read?.includes(path) === true) {
        return Promise.resolve({
          status: "error",
          error: { kind: "fileUnavailable" },
        });
      }
      const text = disk[path];
      return Promise.resolve({
        status: "ok",
        data:
          text === undefined
            ? { kind: "missing" }
            : { kind: "text", text, sha256: sha256Hex(text) },
      });
    },
    writeNotebookFile: (
      _folder: unknown,
      path: string,
      text: string,
      expected: { kind: string; sha256?: string },
    ) => {
      writes.push(path);
      if (faults.writable === false) {
        return Promise.resolve({
          status: "error",
          error: { kind: "notWritable" },
        });
      }
      if (faults.write === "error") {
        return Promise.resolve({
          status: "error",
          error: { kind: "writeFailed" },
        });
      }
      const current = disk[path];
      const matches =
        expected.kind === "absent"
          ? current === undefined
          : current !== undefined && sha256Hex(current) === expected.sha256;
      if (!matches) {
        return Promise.resolve({ status: "ok", data: { kind: "changed" } });
      }
      disk[path] = text;
      return Promise.resolve({
        status: "ok",
        data: { kind: "saved", snapshot: null },
      });
    },
    moveToTrash: (_folder: unknown, path: string) => {
      if (faults.trash === "error") {
        return Promise.resolve({
          status: "error",
          error: { kind: "writeFailed" },
        });
      }
      trashed.push(path);
      delete disk[path];
      return Promise.resolve({
        status: "ok",
        data: { location: `_notebook/.trash/x/${path}` },
      });
    },
  };
  return { api: api as unknown as CanvasApi, disk, trashed, writes };
}
