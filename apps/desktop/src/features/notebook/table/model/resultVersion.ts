import type { ArtefactsFileModel } from "@research-notebook/format";

/** The version a result opens at: a copy's latest, or `null` for a linked file. */
export function previewVersion(
  file: ArtefactsFileModel,
  artefactId: string,
): number | null {
  const artefact = file.artefacts.find((a) => a.id === artefactId);
  if (artefact === undefined || artefact.mode !== "copy") return null;
  return Math.max(...artefact.versions.map((v) => v.v));
}
