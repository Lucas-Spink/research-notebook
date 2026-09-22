import { fail, ok, type Result } from "../result";
import type { ArtefactsFileModel } from "../schema";
import { invalid } from "./project-edit";
import type { NotebookError } from "./types";

/** Whether a copy-mode artefact's source still matches its latest captured
 * version (FR-EVD-06). */
export type SourceUpdateStatus = "upToDate" | "changed";

/**
 * Compares a fresh hash of a copy-mode artefact's original source file
 * against its latest version, so a caller can offer a new version without
 * ever creating one automatically (FR-EVD-06): capturing that version is a
 * separate, explicit call to `applyCapture` with `{kind: "existing"}`, not
 * something this function does. The hash itself is read the same way
 * link-mode evidence is (`nb-fs`'s `observe_link`, ADR-0031) — identity is
 * decided by hash regardless of mode (spec 9.3) — this module only compares
 * the two hashes it is given.
 */
export function checkSourceForUpdate(
  file: ArtefactsFileModel,
  artefactId: string,
  sourceSha256: string,
): Result<{ status: SourceUpdateStatus }, NotebookError> {
  const artefact = file.artefacts.find((a) => a.id === artefactId);
  if (artefact === undefined) {
    return fail({ kind: "notFound", entity: "artefact", id: artefactId });
  }
  if (artefact.mode !== "copy") {
    return fail(
      invalid("only a copy-mode artefact has versions to update", "mode"),
    );
  }
  const last = artefact.versions[artefact.versions.length - 1];
  const status: SourceUpdateStatus =
    last !== undefined && last.sha256 === sourceSha256 ? "upToDate" : "changed";
  return ok({ status });
}
