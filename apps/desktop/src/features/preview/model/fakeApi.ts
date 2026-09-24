import type {
  AssetKind,
  FolderHandle,
  NotebookPreview,
  PreviewFailure,
  TablePreview,
  TextPreview,
} from "../../../ipc/bindings";
import type { PreviewApi, PreviewTarget } from "./load";

export const FOLDER: FolderHandle = 7;

export const TARGET: PreviewTarget = {
  folder: FOLDER,
  file: "_notebook/experiments/EXP-001/evidence/a",
  sha256: "a".repeat(64),
};

export const SAMPLE_TABLE: TablePreview = {
  header: ["gene", "count"],
  rows: [
    ["BRCA1", "12"],
    ["TP53", "40"],
  ],
  encoding: "utf8",
  complete: true,
  moreRows: false,
  moreColumns: false,
  dimensions: { rows: 2, columns: 2 },
};

export const SAMPLE_TEXT: TextPreview = {
  lines: ["import numpy as np", "print(np.pi)"],
  encoding: "utf8",
  complete: true,
};

export const SAMPLE_NOTEBOOK: NotebookPreview = {
  kind: "jupyter",
  language: "python",
  kernel: "Python 3 (ipykernel)",
};

type Options = {
  /** Every command refuses with this failure. */
  fail?: PreviewFailure;
  /** Every command throws, as a broken IPC call would. */
  throws?: boolean;
};

type Call = { command: string; sha256?: string };

/** The preview commands, answering from fixed samples and recording each call. */
export function fakePreviewApi(options: Options = {}): PreviewApi & {
  calls: Call[];
} {
  const calls: Call[] = [];
  const answer = <T>(call: Call, data: T) => {
    calls.push(call);
    if (options.throws === true) {
      return Promise.reject(new Error("IPC failed"));
    }
    if (options.fail !== undefined) {
      return Promise.resolve({ status: "error" as const, error: options.fail });
    }
    return Promise.resolve({ status: "ok" as const, data });
  };
  return {
    calls,
    previewAsset: (_folder, _file, kind: AssetKind) =>
      answer({ command: `previewAsset:${kind}` }, { url: `asset://${kind}` }),
    previewThumbnail: (_folder, _file, sha256) =>
      answer(
        { command: "previewThumbnail", sha256 },
        { url: "asset://thumbnail" },
      ),
    previewTable: (_folder, _file, expanded) =>
      answer(
        { command: `previewTable:${expanded ? "expanded" : "initial"}` },
        SAMPLE_TABLE,
      ),
    previewText: () => answer({ command: "previewText" }, SAMPLE_TEXT),
    previewNotebook: () =>
      answer({ command: "previewNotebook" }, SAMPLE_NOTEBOOK),
  };
}
