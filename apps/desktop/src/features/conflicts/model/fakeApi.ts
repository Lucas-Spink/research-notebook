import type { ChangeReport, FolderHandle } from "../../../ipc/bindings";
import type { Api } from "./session";

/** What `readNotebookFile` answers for a path: text, `missing`, or an error. */
export type Disk = { text: string; sha256: string } | "missing" | "error";

export const FOLDER: FolderHandle = 1;

/** A command API that records reads and answers from `files`. */
export function fakeApi(files: Record<string, Disk> = {}) {
  const reads: string[] = [];
  const api: Pick<Api, "readNotebookFile"> = {
    readNotebookFile: (_folder, path) => {
      reads.push(path);
      const found = files[path] ?? "missing";
      if (found === "error") {
        return Promise.resolve({
          status: "error",
          error: { kind: "fileUnavailable" },
        });
      }
      if (found === "missing") {
        return Promise.resolve({ status: "ok", data: { kind: "missing" } });
      }
      return Promise.resolve({
        status: "ok",
        data: { kind: "text", text: found.text, sha256: found.sha256 },
      });
    },
  };
  return {
    api,
    reads,
    /** Changes what a later read finds. */
    set: (path: string, disk: Disk) => {
      files[path] = disk;
    },
  };
}

export function report(
  changes: ChangeReport["changes"],
  needsRescan = false,
): ChangeReport {
  return { watching: true, changes, needsRescan };
}
