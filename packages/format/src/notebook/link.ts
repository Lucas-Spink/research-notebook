import { fail, ok, type Result } from "../result";
import {
  ARTEFACT_TYPES,
  ArtefactsFile,
  type ArtefactModel,
  type ArtefactsFileModel,
} from "../schema";
import type { NotebookEnv, NotebookError } from "./types";
import { formatTimestamp, refusal } from "./util";

/** An artefact recorded in place rather than copied. */
type LinkArtefactModel = Extract<ArtefactModel, { mode: "link" }>;

/**
 * What nb-fs observed of a linked file (`LinkObservation`, spec FR-EVD-07):
 * its hash, size and modification time when last read. nb-fs never parses
 * `artefacts.yaml` (AGENTS.md rule 2), so this crosses the boundary as plain
 * scalars, not a parsed record.
 */
export interface LinkObservation {
  sha256: string;
  size: number;
  /** RFC 3339 in UTC with second precision, as `nb-fs` formats it. */
  observedMtime: string;
}

/** A file above the copy threshold (or force-linked by a per-capture
 * override), recorded in place rather than copied (FR-EVD-02, spec 5.8). */
export interface LinkTarget {
  name: string;
  role: "result" | "method";
  type: (typeof ARTEFACT_TYPES)[number];
  source: { root: string; path: string };
}

/**
 * Records a new link-mode artefact from an observation nb-fs already made
 * (FR-EVD-02, FR-EVD-07). No bytes are copied, so there is nothing to
 * verify beyond the hash nb-fs already computed while reading the file.
 */
export function applyLink(
  file: ArtefactsFileModel,
  target: LinkTarget,
  observed: LinkObservation,
  env: NotebookEnv,
): Result<{ file: ArtefactsFileModel; artefactId: string }, NotebookError> {
  const artefactId = env.newId();
  const now = formatTimestamp(env.now());
  const candidate = {
    ...file,
    artefacts: [
      ...file.artefacts,
      {
        id: artefactId,
        name: target.name,
        role: target.role,
        mode: "link" as const,
        type: target.type,
        source: target.source,
        created: now,
        link: {
          sha256: observed.sha256,
          size: observed.size,
          observed_mtime: observed.observedMtime,
          checked: now,
        },
      },
    ],
  };
  const checked = ArtefactsFile.safeParse(candidate);
  if (!checked.success) return fail(refusal(checked.error));
  return ok({ file: checked.data, artefactId });
}

/** Finds a link-mode artefact by id, or `undefined` for a missing id or one
 * that is captured by copy instead. */
function findLinkArtefact(
  file: ArtefactsFileModel,
  artefactId: string,
): { index: number; artefact: LinkArtefactModel } | undefined {
  const index = file.artefacts.findIndex((a) => a.id === artefactId);
  const artefact = index === -1 ? undefined : file.artefacts[index];
  if (artefact === undefined || artefact.mode !== "link") return undefined;
  return { index, artefact };
}

function replaceArtefact(
  file: ArtefactsFileModel,
  index: number,
  artefact: LinkArtefactModel,
): ArtefactsFileModel {
  return {
    ...file,
    artefacts: file.artefacts.map((a, i) => (i === index ? artefact : a)),
  };
}

/**
 * Records that a linked file's availability was checked (FR-EVD-07 "on
 * open"), without altering the hash, size or modification time already
 * recorded: a stat-only check is not a re-observation, so it must never
 * overwrite what an actual read of the file established (spec P4). A
 * missing file is checked the same way as a present one — nothing about a
 * missing link is written here (FR-EVD-08) beyond this timestamp.
 */
export function applyLinkChecked(
  file: ArtefactsFileModel,
  artefactId: string,
  env: NotebookEnv,
): Result<{ file: ArtefactsFileModel }, NotebookError> {
  const found = findLinkArtefact(file, artefactId);
  if (found === undefined) {
    return fail({ kind: "notFound", entity: "artefact", id: artefactId });
  }
  const updated: LinkArtefactModel = {
    ...found.artefact,
    link: { ...found.artefact.link, checked: formatTimestamp(env.now()) },
  };
  const checked = ArtefactsFile.safeParse(
    replaceArtefact(file, found.index, updated),
  );
  if (!checked.success) return fail(refusal(checked.error));
  return ok({ file: checked.data });
}

/**
 * Applies a relink the caller has already confirmed (FR-EVD-08: never
 * applied automatically — ranking candidates and confirming one are
 * different, explicit steps, and this function is only ever the second):
 * points the artefact at the new location and replaces its link record with
 * a fresh observation of that file.
 */
export function applyRelink(
  file: ArtefactsFileModel,
  artefactId: string,
  source: { root: string; path: string },
  observed: LinkObservation,
  env: NotebookEnv,
): Result<{ file: ArtefactsFileModel }, NotebookError> {
  const found = findLinkArtefact(file, artefactId);
  if (found === undefined) {
    return fail({ kind: "notFound", entity: "artefact", id: artefactId });
  }
  const updated: LinkArtefactModel = {
    ...found.artefact,
    source,
    link: {
      sha256: observed.sha256,
      size: observed.size,
      observed_mtime: observed.observedMtime,
      checked: formatTimestamp(env.now()),
    },
  };
  const checked = ArtefactsFile.safeParse(
    replaceArtefact(file, found.index, updated),
  );
  if (!checked.success) return fail(refusal(checked.error));
  return ok({ file: checked.data });
}
