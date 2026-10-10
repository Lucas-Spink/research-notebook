import {
  groupLocationsOf,
  type ArtefactsFileModel,
} from "@research-notebook/format";

/** What the file records about one result, for its Details panel (issue #101, section 5.7). */
export type ArtefactDetails = {
  name: string;
  type: string;
  /** `copy`: kept inside the project; `link`: recorded where it lives. */
  mode: "copy" | "link";
  classification: string | null;
  /** Bytes of the latest captured version, or of the linked file when last observed. */
  size: number;
  /** The day it was first added, as `YYYY-MM-DD`. */
  added: string;
  /** Where the original file was, relative to its root. */
  sourcePath: string;
  /** Every group it is in, as a path such as `Figures / Supplementary`. */
  folders: string[];
};

/** The details of `artefactId`, or `null` when the file has no such artefact. */
export function artefactDetails(
  file: ArtefactsFileModel,
  artefactId: string,
): ArtefactDetails | null {
  const found = file.artefacts.find((a) => a.id === artefactId);
  if (found === undefined) return null;
  const latest = found.mode === "copy" ? found.versions.at(-1) : undefined;
  return {
    name: found.name,
    type: found.type,
    mode: found.mode,
    classification: found.classification ?? null,
    size: found.mode === "link" ? found.link.size : (latest?.size ?? 0),
    added: found.created.slice(0, 10),
    sourcePath: found.source.path,
    folders: groupLocationsOf(file, artefactId).map((path) => path.join(" / ")),
  };
}

/** A byte count for people: 512 B, 1.5 KB, 3.2 MB. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}
