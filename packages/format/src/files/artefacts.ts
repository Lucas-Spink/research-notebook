import type { ArtefactsFileModel } from "../schema";
import { fail, type FormatError, type Result } from "../result";

/** Parses an experiment's `artefacts.yaml`. */
export function parseArtefacts(
  _text: string,
): Result<ArtefactsFileModel, FormatError> {
  void _text;
  return fail({ kind: "syntax", message: "not implemented" });
}

/** Writes `artefacts.yaml` in canonical form. */
export function serialiseArtefacts(_file: ArtefactsFileModel): string {
  void _file;
  throw new Error("not implemented");
}
