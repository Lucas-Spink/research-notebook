import type {
  Availability,
  FileActionKind,
  FolderHandle,
  OpenFailure,
} from "../../../ipc/bindings";
import type { PanelApi } from "./api";

export const FOLDER: FolderHandle = 3;
export const PROJECT_ID = "01JAX9Q2B7N4M8T6V3W5Y1Z0KC";

type Call =
  | { command: "openCapturedFileAction"; file: string; action: FileActionKind }
  | {
      command: "openLinkedFileAction";
      root: string;
      path: string;
      action: FileActionKind;
    }
  | { command: "openProjectFolder" }
  | { command: "linkedArtefactAvailability"; root: string; path: string };

type Options = {
  /** Every open/reveal/VS Code/copy/folder action refuses with this. */
  actionFails?: OpenFailure;
  /** The availability check answers with this. */
  availability?: Availability;
  /** The availability check refuses with this. */
  availabilityFails?: OpenFailure;
};

/** The panel's commands, answering from fixed samples and recording each
 * call. `PreviewApi` methods are safe stubs: the panel's own tests use
 * artefacts that never need them (their content already tested in
 * `features/preview`). */
export function fakePanelApi(
  options: Options = {},
): PanelApi & { calls: Call[] } {
  const calls: Call[] = [];
  const action = (call: Call) => {
    calls.push(call);
    return options.actionFails === undefined
      ? Promise.resolve({ status: "ok" as const, data: null })
      : Promise.resolve({
          status: "error" as const,
          error: options.actionFails,
        });
  };
  return {
    calls,
    openCapturedFileAction: (_folder, file, act) =>
      action({ command: "openCapturedFileAction", file, action: act }),
    openLinkedFileAction: (_folder, _projectId, root, path, act) =>
      action({ command: "openLinkedFileAction", root, path, action: act }),
    openProjectFolder: () => action({ command: "openProjectFolder" }),
    linkedArtefactAvailability: (_folder, _projectId, root, path) => {
      calls.push({ command: "linkedArtefactAvailability", root, path });
      return options.availabilityFails === undefined
        ? Promise.resolve({
            status: "ok" as const,
            data: options.availability ?? { kind: "available", size: 100 },
          })
        : Promise.resolve({
            status: "error" as const,
            error: options.availabilityFails,
          });
    },
    previewAsset: () =>
      Promise.resolve({ status: "ok" as const, data: { url: "asset://x" } }),
    previewThumbnail: () =>
      Promise.resolve({ status: "ok" as const, data: { url: "asset://x" } }),
    previewTable: () =>
      Promise.resolve({
        status: "ok" as const,
        data: {
          header: [],
          rows: [],
          encoding: "utf8" as const,
          complete: true,
          moreRows: false,
          moreColumns: false,
          dimensions: null,
        },
      }),
    previewText: () =>
      Promise.resolve({
        status: "ok" as const,
        data: { lines: [], encoding: "utf8" as const, complete: true },
      }),
    previewNotebook: () =>
      Promise.resolve({
        status: "ok" as const,
        data: { kind: "jupyter" as const, language: null, kernel: null },
      }),
  };
}
