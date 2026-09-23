import { fail, ok, type Result } from "../result";
import {
  ARTEFACT_TYPES,
  ArtefactsFile,
  type ArtefactsFileModel,
} from "../schema";
import { invalid } from "./project-edit";
import type { NotebookEnv, NotebookError } from "./types";
import { formatTimestamp, refusal } from "./util";

/**
 * A file nb-fs has already copied and verified (`CapturedVersion`, spec
 * FR-EVD-03): the version file's path relative to the experiment folder,
 * its hash and size, and the version number nb-fs decided. nb-fs never
 * parses `artefacts.yaml` (AGENTS.md rule 2), so these cross the boundary
 * as plain scalars, not a parsed record.
 */
export interface CapturedFile {
  /** Relative to the experiment folder, beginning `evidence/` or `methods/`. */
  file: string;
  sha256: string;
  size: number;
  number: number;
  /**
   * Git provenance for the source file (FR-EVD-12), from `nb-git`'s
   * `provenance_in_project` (S3-T04, ADR-0032) — a separate lookup from the
   * copy itself, not part of what `nb-fs`'s `CapturedVersion` returns.
   * Absent when the source is not inside a usable git repository.
   */
  provenance?: {
    repo: string;
    commit: string;
    pathInRepo: string;
    fileDirty: boolean;
    treeDirty: boolean;
  };
}

/** What a capture is for: a brand-new artefact, or a later version of one
 * already in the file. */
export type CaptureTarget =
  | {
      kind: "new";
      name: string;
      role: "result" | "method";
      type: (typeof ARTEFACT_TYPES)[number];
      source: { root: string; path: string };
    }
  | { kind: "existing"; artefactId: string };

/**
 * Records a capture nb-fs already placed on disk (FR-EVD-03 to FR-EVD-05):
 * a new artefact with one version, or a new version appended to an
 * existing copy-mode artefact. nb-fs itself decides whether a capture is a
 * duplicate (spec P2: it holds the hashes, this module never does I/O), so
 * this function is never called for one; there is nothing here to undo.
 */
export function applyCapture(
  file: ArtefactsFileModel,
  target: CaptureTarget,
  captured: CapturedFile,
  env: NotebookEnv,
): Result<{ file: ArtefactsFileModel; artefactId: string }, NotebookError> {
  const version = {
    v: captured.number,
    file: captured.file,
    sha256: captured.sha256,
    size: captured.size,
    captured: formatTimestamp(env.now()),
    ...(captured.provenance !== undefined && {
      provenance: {
        repo: captured.provenance.repo,
        commit: captured.provenance.commit,
        path_in_repo: captured.provenance.pathInRepo,
        file_dirty: captured.provenance.fileDirty,
        tree_dirty: captured.provenance.treeDirty,
      },
    }),
  };

  if (target.kind === "existing") {
    const index = file.artefacts.findIndex((a) => a.id === target.artefactId);
    const artefact = index === -1 ? undefined : file.artefacts[index];
    if (artefact === undefined) {
      return fail({
        kind: "notFound",
        entity: "artefact",
        id: target.artefactId,
      });
    }
    if (artefact.mode !== "copy") {
      return fail(
        invalid("only a copy-mode artefact can capture a new version", "mode"),
      );
    }
    const last = artefact.versions[artefact.versions.length - 1];
    if (last !== undefined && version.v <= last.v) {
      return fail(
        invalid("a captured version must be numbered after the last one", "v"),
      );
    }
    const updated = { ...artefact, versions: [...artefact.versions, version] };
    const candidate = {
      ...file,
      artefacts: file.artefacts.map((a, i) => (i === index ? updated : a)),
    };
    const checked = ArtefactsFile.safeParse(candidate);
    if (!checked.success) return fail(refusal(checked.error));
    return ok({ file: checked.data, artefactId: target.artefactId });
  }

  const artefactId = env.newId();
  const candidate = {
    ...file,
    artefacts: [
      ...file.artefacts,
      {
        id: artefactId,
        name: target.name,
        role: target.role,
        mode: "copy" as const,
        type: target.type,
        source: target.source,
        created: formatTimestamp(env.now()),
        versions: [version],
      },
    ],
  };
  const checked = ArtefactsFile.safeParse(candidate);
  if (!checked.success) return fail(refusal(checked.error));
  return ok({ file: checked.data, artefactId });
}
