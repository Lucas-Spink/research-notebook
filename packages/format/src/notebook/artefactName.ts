import { fail, ok, type Result } from "../result";
import { ArtefactsFile, type ArtefactsFileModel } from "../schema";
import type { NotebookError } from "./types";
import { refusal } from "./util";

/**
 * Changes an artefact's display name (issue #101, "Rename Display Name"). Only
 * `name` changes: the file it records, its versions and its groups are not
 * touched, so renaming never moves or renames anything on disk. The name is
 * trimmed and validated the way the file is read, so an empty or multi-line
 * name is refused rather than written.
 */
export function renameArtefact(
  file: ArtefactsFileModel,
  artefactId: string,
  name: string,
): Result<ArtefactsFileModel, NotebookError> {
  if (!file.artefacts.some((a) => a.id === artefactId)) {
    return fail({ kind: "notFound", entity: "artefact", id: artefactId });
  }
  const artefacts = file.artefacts.map((a) =>
    a.id === artefactId ? { ...a, name: name.trim() } : a,
  );
  const parsed = ArtefactsFile.safeParse({ ...file, artefacts });
  return parsed.success ? ok(parsed.data) : fail(refusal(parsed.error));
}
