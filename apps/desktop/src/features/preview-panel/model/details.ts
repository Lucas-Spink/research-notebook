import type { ArtefactModel } from "@research-notebook/format";
import {
  planPreview,
  versionPath,
  type FileDetails,
  type PreviewPlan,
} from "../../preview";

/** The last (highest `v`) version of a copy-mode artefact; `undefined` for
 * a link-mode one, which has no `versions[]` (spec 5.8). */
export function latestVersion(artefact: ArtefactModel) {
  return artefact.mode === "copy"
    ? artefact.versions[artefact.versions.length - 1]
    : undefined;
}

/** The last segment of a link-mode artefact's `source.path`. */
export function linkFileName(artefact: ArtefactModel): string {
  const path = artefact.mode === "link" ? artefact.source.path : "";
  return path.split("/").at(-1) ?? path;
}

/**
 * What FR-PRV-01 shows of the file itself: name, file name, size and
 * location. Copy mode shows the latest version, under the experiment
 * folder; link mode shows the recorded size and the source path as its
 * location, since the file is not under the project's own folder layout.
 */
export function fileDetailsFor(
  artefact: ArtefactModel,
  experimentFolder: string,
): FileDetails {
  const version = latestVersion(artefact);
  if (version !== undefined) {
    return {
      name: artefact.name,
      fileName: version.file.split("/").at(-1) ?? version.file,
      size: version.size,
      location: versionPath(experimentFolder, version.file),
    };
  }
  return {
    name: artefact.name,
    fileName: linkFileName(artefact),
    size: artefact.mode === "link" ? artefact.link.size : 0,
    location: artefact.mode === "link" ? artefact.source.path : "",
  };
}

/**
 * How the artefact's content is previewed (spec 8): the latest version's
 * file for copy mode; the details-only, "linked" fallback for link mode,
 * since no command reads a linked file's content (ADR-0038 §1).
 */
export function previewPlanFor(artefact: ArtefactModel): PreviewPlan {
  const version = latestVersion(artefact);
  if (version === undefined) {
    return { kind: "other", reason: "linked" };
  }
  return planPreview({
    fileName: version.file,
    type: artefact.type,
    captured: true,
  });
}
