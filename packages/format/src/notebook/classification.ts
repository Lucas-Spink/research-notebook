import { fail, ok, type Result } from "../result";
import { ArtefactsFile, type ArtefactsFileModel } from "../schema";
import { invalid } from "./project-edit";
import type { NotebookError } from "./types";
import { refusal } from "./util";

/**
 * Sets, or with `null` clears, a result's classification (ADR-0059). Like
 * the group operations it changes nothing but the one field: no file,
 * version or group is touched, and the classification is independent of
 * which groups hold the artefact. Method artefacts are refused. The change
 * is validated the way the file is read, so an invalid value is never written.
 */
export function setClassification(
  file: ArtefactsFileModel,
  artefactId: string,
  classification: string | null,
): Result<ArtefactsFileModel, NotebookError> {
  const target = file.artefacts.find((a) => a.id === artefactId);
  if (target === undefined) {
    return fail({ kind: "notFound", entity: "artefact", id: artefactId });
  }
  if (target.role !== "result") {
    return fail(invalid("Only a result can be classified.", "role"));
  }
  const artefacts = file.artefacts.map((a) => {
    if (a.id !== artefactId) return a;
    // Rebuilt without the old value so a cleared field is absent, not undefined.
    const rest = Object.entries(a).filter(([key]) => key !== "classification");
    return Object.fromEntries(
      classification === null
        ? rest
        : [...rest, ["classification", classification]],
    );
  });
  const parsed = ArtefactsFile.safeParse({ ...file, artefacts });
  return parsed.success ? ok(parsed.data) : fail(refusal(parsed.error));
}
