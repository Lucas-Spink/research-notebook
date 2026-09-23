import type { ArtefactsFileModel } from "../schema";

/**
 * The source paths already captured under `folder`, relative to it, for a
 * discovery scan to mark (FR-EVD-09, ADR-0035). `root` is `"project"` or an
 * external root's ULID, as in `source.root`; `folder` is `/`-separated and
 * relative to that root, with `""` meaning the root itself. Folder segments
 * are compared without regard to case or Unicode normalisation, matching
 * how `nb-fs` compares the paths it is handed; the returned paths keep the
 * spelling recorded in `artefacts.yaml`. Copy and link artefacts count alike.
 */
export function capturedSourcePaths(
  files: readonly ArtefactsFileModel[],
  root: string,
  folder: string,
): string[] {
  const prefix = segments(folder).map(segmentKey);
  const found = new Set<string>();
  for (const file of files) {
    for (const artefact of file.artefacts) {
      if (artefact.source.root !== root) continue;
      const parts = segments(artefact.source.path);
      if (parts.length <= prefix.length) continue;
      const inside = prefix.every(
        (key, i) => segmentKey(parts[i] ?? "") === key,
      );
      if (inside) found.add(parts.slice(prefix.length).join("/"));
    }
  }
  return [...found].sort();
}

function segments(path: string): string[] {
  return path.split("/").filter((part) => part !== "");
}

function segmentKey(segment: string): string {
  return segment.normalize("NFC").toLowerCase();
}
