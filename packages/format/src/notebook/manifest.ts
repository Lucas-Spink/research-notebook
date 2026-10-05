import type { ArtefactModel, GroupModel } from "../schema";
import type { Arranged, ArrangedExperiment } from "./arrange";
import { experimentFolderPath } from "./types";

/** What the filesystem said about one captured version file; gathered by the caller (AGENTS.md section 4). */
export type ManifestObservation =
  | {
      kind: "observed";
      /** Bytes on disk now. */
      size: number;
      /** Modification time, milliseconds since the Unix epoch. */
      modifiedMs: number;
      /** Lower-case hexadecimal SHA-256 of the bytes on disk now. */
      sha256: string;
    }
  | { kind: "missing" }
  | { kind: "unreadable" };

/** One line of `manifest.csv` (FR-ARC-02). */
export interface ManifestRow {
  /** Project-relative, beginning `_notebook/`, with `/` separators. */
  path: string;
  size: number;
  /** UTC, to the second, as in the notebook's other timestamps. */
  modified: string;
  sha256: string;
  /** Refs of the experiments that hold the file. */
  experiments: string[];
  /** Group paths of its artefact, such as `Figures/QC`, in tree order. */
  groups: string[];
}

/**
 * A file the manifest could not describe truthfully, or that is not as
 * `artefacts.yaml` recorded it. `missing` and `unreadable` files get no row;
 * a `differs` file does, with the hash it has now.
 */
export interface ManifestProblem {
  kind: "missing" | "unreadable" | "differs";
  path: string;
  experiment: string;
}

export interface Manifest {
  rows: ManifestRow[];
  /** The text of `exports/manifest.csv`. */
  csv: string;
  problems: ManifestProblem[];
}

const HEADER = ["path", "size", "modified", "sha256", "experiments", "groups"];

/**
 * One CSV cell (RFC 4180). Text a spreadsheet would run as a formula is
 * prefixed with an apostrophe, because group names are the person's own text.
 */
export function manifestCell(text: string): string {
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export function experimentsOf(arranged: Arranged): ArrangedExperiment[] {
  return [
    ...arranged.questions.flatMap((question) => question.experiments),
    ...arranged.unassigned,
  ];
}

/** Paths of every group holding `id`, parents before children, in tree order. */
function groupPathsOf(id: string, groups: readonly GroupModel[]): string[] {
  const found: string[] = [];
  const visit = (group: GroupModel, parent: string): void => {
    const path = parent === "" ? group.name : `${parent}/${group.name}`;
    if (group.items.includes(id)) found.push(path);
    group.groups.forEach((child) => visit(child, path));
  };
  groups.forEach((group) => visit(group, ""));
  return found;
}

function timestamp(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function rowCells(row: ManifestRow): string[] {
  return [
    row.path,
    String(row.size),
    row.modified,
    row.sha256,
    row.experiments.join(";"),
    row.groups.join(";"),
  ].map(manifestCell);
}

function byPath<T extends { path: string }>(a: T, b: T): number {
  return a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
}

/**
 * Builds `manifest.csv` for every captured version file (FR-ARC-02): the
 * files in the notebook. Linked files live outside it and are not listed
 * (ADR-0051). The hash and size are what the file has now, so the manifest
 * says what is on disk; a difference from `artefacts.yaml` is reported, not
 * hidden. A file that was not observed is reported as unreadable, never
 * assumed fine. Rows are sorted by path, so the text does not depend on the
 * order observations arrived in.
 */
export function buildManifest(
  arranged: Arranged,
  observed: ReadonlyMap<string, ManifestObservation>,
): Manifest {
  const rows: ManifestRow[] = [];
  const problems: ManifestProblem[] = [];
  for (const item of experimentsOf(arranged)) {
    if (item.artefacts?.kind !== "file") continue;
    const { file } = item.artefacts;
    const experiment = item.experiment.file.frontmatter.ref;
    for (const artefact of file.artefacts) {
      if (artefact.mode !== "copy") continue;
      const groups = groupPathsOf(artefact.id, file.groups);
      for (const version of artefact.versions) {
        const path = `${experimentFolderPath(item.experiment.folder)}/${version.file}`;
        const seen = observed.get(path) ?? { kind: "unreadable" as const };
        if (seen.kind !== "observed") {
          problems.push({ kind: seen.kind, path, experiment });
          continue;
        }
        if (differs(version, seen)) {
          problems.push({ kind: "differs", path, experiment });
        }
        rows.push({
          path,
          size: seen.size,
          modified: timestamp(seen.modifiedMs),
          sha256: seen.sha256,
          experiments: [experiment],
          groups,
        });
      }
    }
  }
  rows.sort(byPath);
  problems.sort(byPath);
  const lines = [HEADER, ...rows.map(rowCells)].map((cells) => cells.join(","));
  return { rows, csv: `${lines.join("\n")}\n`, problems };
}

type CopyVersion = Extract<ArtefactModel, { mode: "copy" }>["versions"][number];

function differs(
  version: CopyVersion,
  seen: Extract<ManifestObservation, { kind: "observed" }>,
): boolean {
  return version.sha256 !== seen.sha256 || version.size !== seen.size;
}
