import {
  buildManifest,
  versionFilesOf,
  type Arranged,
  type ManifestObservation,
  type ManifestProblem,
  type Result,
} from "@research-notebook/format";
import type { commands, VersionObserved } from "../../../ipc/bindings";

/** The two commands the manifest is made through: one only reads, one writes `exports/manifest.csv`. */
export type ManifestApi = Pick<
  typeof commands,
  "observeVersionFiles" | "writeManifest"
>;

/** What the person is told after the manifest was written. */
export type ManifestOutcome = {
  /** Files listed in the manifest. */
  files: number;
  /** Files left out, or listed with a hash that differs from `artefacts.yaml`. */
  problems: readonly ManifestProblem[];
};

/** Why no manifest was written. Nothing is written in any of these cases. */
export type ManifestFailure = "filesNotChecked" | "notWritable" | "writeFailed";

type Input = { api: ManifestApi; folder: number; arranged: Arranged };

function observationOf(found: VersionObserved): ManifestObservation {
  switch (found.kind) {
    case "observed":
      // A size or time that is not a number came from a value no file has.
      return found.size === null || found.modifiedMs === null
        ? { kind: "unreadable" }
        : {
            kind: "observed",
            size: found.size,
            modifiedMs: found.modifiedMs,
            sha256: found.sha256,
          };
    case "missing":
      return { kind: "missing" };
    case "unreadable":
      return { kind: "unreadable" };
  }
}

/**
 * Makes `exports/manifest.csv` (FR-ARC-02): asks the filesystem what every
 * captured file is now, lets `packages/format` build the CSV, and stores it.
 * Files that cannot be described are reported, never left out silently.
 * If the files cannot be asked about at all nothing is written, because a
 * manifest with no entries would read as an empty archive.
 */
export async function generateManifest(
  input: Input,
): Promise<Result<ManifestOutcome, ManifestFailure>> {
  const { api, folder, arranged } = input;
  const files = versionFilesOf(arranged);
  const observed = new Map<string, ManifestObservation>();
  if (files.length > 0) {
    const asked = await api
      .observeVersionFiles(
        folder,
        files.map((file) => file.path),
      )
      .catch(() => null);
    if (
      asked === null ||
      asked.status !== "ok" ||
      asked.data.length !== files.length
    ) {
      return { ok: false, error: "filesNotChecked" };
    }
    files.forEach((file, index) => {
      const found = asked.data[index];
      if (found !== undefined) observed.set(file.path, observationOf(found));
    });
  }

  const manifest = buildManifest(arranged, observed);
  const written = await api
    .writeManifest(folder, manifest.csv)
    .catch(() => null);
  if (written === null) return { ok: false, error: "writeFailed" };
  if (written.status !== "ok") {
    return {
      ok: false,
      error:
        written.error.kind === "notWritable" ? "notWritable" : "writeFailed",
    };
  }
  return {
    ok: true,
    value: { files: manifest.rows.length, problems: manifest.problems },
  };
}
