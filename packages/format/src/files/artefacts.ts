import { ARTEFACTS_SHAPE, orderByShapeAsMaps } from "../key-order";
import type { FormatError, Result } from "../result";
import { ArtefactsFile, type ArtefactsFileModel } from "../schema";
import { writeYaml } from "../yaml/write";
import { parseYamlFile } from "./read";

/** Each artefact's `source` is written in flow style (format-v1.md 3.4). */
const FLOW_PATHS = ["artefacts.*.source"];

/** Parses an experiment's `artefacts.yaml`. */
export function parseArtefacts(
  text: string,
): Result<ArtefactsFileModel, FormatError> {
  return parseYamlFile(text, ArtefactsFile);
}

/** Writes `artefacts.yaml` in canonical form. */
export function serialiseArtefacts(file: ArtefactsFileModel): string {
  return writeYaml(orderByShapeAsMaps(file, ARTEFACTS_SHAPE), FLOW_PATHS);
}
