import {
  buildIntegrityReport,
  linkedArtefactsOf,
  versionFilesOf,
  type Arranged,
  type BibliographyFileModel,
  type IntegrityFinding,
  type LinkAvailability,
  type Result,
} from "@research-notebook/format";
import type { Availability, commands } from "../../../ipc/bindings";

/** The two read-only commands the check asks the filesystem through. */
export type IntegrityApi = Pick<
  typeof commands,
  "checkVersionFiles" | "linkedArtefactAvailability"
>;

/** Why no report could be made: the captured files could not be checked at all. */
export type CheckFailure = "filesNotChecked";

type Input = {
  api: IntegrityApi;
  folder: number;
  projectId: string;
  arranged: Arranged;
  bibliography: BibliographyFileModel;
};

function availabilityOf(found: Availability): LinkAvailability {
  return found.kind;
}

/** Runs the integrity check (FR-ARC-01): gathers what the filesystem says, then
 * lets `packages/format` build the report. Nothing is written. A linked file
 * whose check fails is reported as unchecked rather than stopping the rest;
 * captured files that cannot be checked stop the report, because a clean
 * report would then be false. */
export async function runIntegrityCheck(
  input: Input,
): Promise<Result<IntegrityFinding[], CheckFailure>> {
  const { api, folder, projectId, arranged, bibliography } = input;
  const files = versionFilesOf(arranged);
  const versionFiles = new Map<string, "missing" | "unreadable">();
  if (files.length > 0) {
    const checked = await api
      .checkVersionFiles(
        folder,
        files.map((file) => file.path),
      )
      .catch(() => null);
    if (checked === null || checked.status !== "ok") {
      return { ok: false, error: "filesNotChecked" };
    }
    for (const problem of checked.data) {
      const file = files[problem.index];
      if (file !== undefined) {
        versionFiles.set(file.path, problem.missing ? "missing" : "unreadable");
      }
    }
  }

  const linked = new Map<string, LinkAvailability>();
  await Promise.all(
    linkedArtefactsOf(arranged).map(async ({ artefactId, root, path }) => {
      const found = await api
        .linkedArtefactAvailability(folder, projectId, root, path)
        .catch(() => null);
      if (found?.status === "ok") {
        linked.set(artefactId, availabilityOf(found.data));
      }
    }),
  );

  return {
    ok: true,
    value: buildIntegrityReport(arranged, bibliography, {
      versionFiles,
      linked,
    }),
  };
}
