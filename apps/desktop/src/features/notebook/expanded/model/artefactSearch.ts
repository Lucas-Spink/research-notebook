import type {
  ArtefactModel,
  ArtefactsFileModel,
  GroupModel,
} from "@research-notebook/format";

/**
 * One artefact as the @ autocomplete shows and inserts it (FR-EDT-04):
 * `target` is the latest version's file, for building the reference node
 * (FR-EDT-05) — link-mode artefacts have no version to pin to and are left
 * out of the search entirely, a deliberate scope limit for this task (no
 * code anywhere resolves a link-mode target to a real relative path yet).
 */
export type ArtefactSearchRow = {
  id: string;
  label: string;
  fileName: string;
  target: string;
  type: ArtefactModel["type"];
  /** `null` for an artefact in no group ("Ungrouped"). */
  groupPath: string | null;
  version: number;
};

function fileNameOf(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function groupPathsFor(
  groups: readonly GroupModel[],
  artefactId: string,
  trail: readonly string[],
): string[] {
  return groups.flatMap((group) => {
    const here = [...trail, group.name];
    const own = group.items.includes(artefactId) ? [here.join(" / ")] : [];
    return [...own, ...groupPathsFor(group.groups, artefactId, here)];
  });
}

/** Every group path `artefactId` is a member of, joined by "; "; `null` for none. */
export function groupPathFor(
  file: ArtefactsFileModel,
  artefactId: string,
): string | null {
  const paths = groupPathsFor(file.groups, artefactId, []);
  return paths.length === 0 ? null : paths.join("; ");
}

function matches(row: { label: string; fileName: string }, query: string) {
  if (query === "") return true;
  const needle = query.toLowerCase();
  return (
    row.label.toLowerCase().includes(needle) ||
    row.fileName.toLowerCase().includes(needle)
  );
}

/**
 * Copy-mode artefacts of `file` whose display name or filename matches
 * `query` (case-insensitive substring, matching the workspace table's own
 * filter convention), ranked in capture order.
 */
export function searchArtefacts(
  file: ArtefactsFileModel,
  query: string,
): ArtefactSearchRow[] {
  return file.artefacts.flatMap((artefact) => {
    if (artefact.mode !== "copy") return [];
    const version = artefact.versions.at(-1);
    if (version === undefined) return [];
    const row: ArtefactSearchRow = {
      id: artefact.id,
      label: artefact.name,
      fileName: fileNameOf(version.file),
      target: version.file,
      type: artefact.type,
      groupPath: groupPathFor(file, artefact.id),
      version: version.v,
    };
    return matches(row, query) ? [row] : [];
  });
}
