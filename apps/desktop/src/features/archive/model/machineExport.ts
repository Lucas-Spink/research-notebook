import {
  buildMachineExport,
  type Arranged,
  type ProjectYamlModel,
  type Result,
} from "@research-notebook/format";
import type { commands } from "../../../ipc/bindings";

/** The two commands the machine-readable export is made through; it writes under `exports/machine/`. */
export type MachineExportApi = Pick<
  typeof commands,
  "appVersion" | "writeMachineExport"
>;

/** What the person is told after the export was written. */
export type MachineExportOutcome = {
  /** Files written, `notebook.json` included. */
  files: number;
  /** Files that could not be written, by name. Each is as it was before. */
  failedFiles: readonly string[];
};

/** Why no export was written. Nothing is claimed in either case. */
export type MachineExportFailure = "notWritable" | "writeFailed";

type Input = {
  api: MachineExportApi;
  folder: number;
  arranged: Arranged;
  project: ProjectYamlModel;
  /** Injected so the files are the same however the export is run in a test. */
  now: () => Date;
};

/**
 * Writes the machine-readable export (FR-ARC-07): `packages/format` builds
 * `notebook.json`, the schemas and the Markdown renderings, and the files are
 * stored through one command. `notebook.json` goes last, so an interrupted run
 * never leaves a new `notebook.json` naming renderings that are not there.
 */
export async function exportMachine(
  input: Input,
): Promise<Result<MachineExportOutcome, MachineExportFailure>> {
  const version = await input.api.appVersion().catch(() => null);
  if (version === null) return { ok: false, error: "writeFailed" };
  const files = buildMachineExport({
    arranged: input.arranged,
    project: input.project,
    appVersion: version,
    now: input.now,
  });
  const written = await input.api
    .writeMachineExport(input.folder, files)
    .catch(() => null);
  if (written === null) return { ok: false, error: "writeFailed" };
  if (written.status !== "ok") {
    return {
      ok: false,
      error:
        written.error.kind === "notWritable" ? "notWritable" : "writeFailed",
    };
  }
  // An answer that does not account for every file would read as "the rest were fine".
  if (written.data.length !== files.length) {
    return { ok: false, error: "writeFailed" };
  }
  const failedFiles = files
    .filter((_, index) => written.data[index] !== "written")
    .map((f) => f.name);
  return {
    ok: true,
    value: { files: files.length - failedFiles.length, failedFiles },
  };
}
