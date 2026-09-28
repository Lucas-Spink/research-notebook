import {
  ungroupedArtefacts,
  type ArtefactsFileModel,
} from "@research-notebook/format";

type Artefact = ArtefactsFileModel["artefacts"][number];
type Group = ArtefactsFileModel["groups"][number];

/** A result shown as a thumbnail: its latest captured version. */
export type ResultsThumbnail = {
  artefactId: string;
  name: string;
  type: Artefact["type"];
  /** Relative to the experiment folder, as `artefacts.yaml` records it. */
  file: string;
  sha256: string;
};

/** What a closed Results cell shows (FR-TBL-06). */
export type ResultsSummary = {
  /** Result artefacts in the experiment. */
  total: number;
  /** Each top-level group, with the results anywhere inside it. */
  groups: { name: string; count: number }[];
  /** Results in no group (FR-GRP-05). */
  ungrouped: number;
  /** Up to four results to show, in the order the Results tree lists them. */
  thumbnails: ResultsThumbnail[];
};

const MAX_THUMBNAILS = 4;

/** The artefacts in `group` and every group inside it, subgroups first, as the tree lists them. */
function inTreeOrder(group: Group): string[] {
  return [...group.groups.flatMap(inTreeOrder), ...group.items];
}

/** The newest captured version; a linked artefact has none (spec 5.8). */
function latest(artefact: Artefact) {
  if (artefact.mode !== "copy") return undefined;
  return artefact.versions.reduce((found, version) =>
    version.v > found.v ? version : found,
  );
}

/**
 * The counts, groups and thumbnails a closed Results cell shows for one
 * experiment (FR-TBL-06, ADR-0044 point 4). Only result artefacts count;
 * a linked artefact has no captured file, so it is counted but not shown.
 */
export function resultsSummary(file: ArtefactsFileModel): ResultsSummary {
  const results = new Map(
    file.artefacts
      .filter((artefact) => artefact.role === "result")
      .map((artefact) => [artefact.id, artefact] as const),
  );
  const groups = file.groups.map((group) => ({
    name: group.name,
    count: new Set(inTreeOrder(group).filter((id) => results.has(id))).size,
  }));
  const ungrouped = ungroupedArtefacts(file);
  const ordered = new Set([
    ...file.groups.flatMap(inTreeOrder),
    ...ungrouped.map((artefact) => artefact.id),
  ]);
  const thumbnails: ResultsThumbnail[] = [];
  for (const id of ordered) {
    if (thumbnails.length === MAX_THUMBNAILS) break;
    const artefact = results.get(id);
    const version = artefact === undefined ? undefined : latest(artefact);
    if (artefact === undefined || version === undefined) continue;
    thumbnails.push({
      artefactId: artefact.id,
      name: artefact.name,
      type: artefact.type,
      file: version.file,
      sha256: version.sha256,
    });
  }
  return {
    total: results.size,
    groups,
    ungrouped: ungrouped.length,
    thumbnails,
  };
}
