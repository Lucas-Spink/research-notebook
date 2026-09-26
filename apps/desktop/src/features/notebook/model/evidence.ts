import {
  EMPTY_ARTEFACTS,
  type ArrangedExperiment,
  type ArtefactsFileModel,
} from "@research-notebook/format";

/**
 * An experiment's artefacts as loaded with the notebook (ADR-0044): its
 * file, an empty one when it has no artefacts.yaml yet, or `null` when that
 * file could not be read, so it is left alone (AGENTS.md rule 5).
 */
export function evidenceOf(
  item: ArrangedExperiment,
): ArtefactsFileModel | null {
  if (item.artefacts === undefined) return EMPTY_ARTEFACTS;
  return item.artefacts.kind === "file" ? item.artefacts.file : null;
}
