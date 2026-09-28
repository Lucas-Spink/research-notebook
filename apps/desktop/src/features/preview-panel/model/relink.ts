import type {
  ArtefactModel,
  ArtefactsFileModel,
  NotebookEnv,
  NotebookError,
  Result,
} from "@research-notebook/format";
import type { RelinkCandidateDto } from "../../../ipc/bindings";

/** Changes one experiment's artefacts.yaml, matching `NotebookActions.editArtefacts`'
 * shape structurally, without importing the notebook feature's internals
 * (AGENTS.md section 4: a feature may only import another's `index.ts`). */
export type RelinkEditArtefacts = (
  experimentFolder: string,
  change: (
    file: ArtefactsFileModel,
    env: NotebookEnv,
  ) => Result<ArtefactsFileModel, NotebookError>,
) => Promise<{ ok: true } | { ok: false; error: NotebookError | null }>;

/** What a relink for one artefact is looking for (FR-EVD-08): its last
 * known name, size and hash. `undefined` for a copy-mode artefact, or a
 * link-mode one with a path holding no plain file name. */
export function relinkExpectationOf(
  artefact: ArtefactModel,
): { fileName: string; size: number; sha256: string } | undefined {
  if (artefact.mode !== "link") return undefined;
  const { path } = artefact.source;
  const slash = path.lastIndexOf("/");
  const fileName = slash === -1 ? path : path.slice(slash + 1);
  if (fileName === "") return undefined;
  return { fileName, size: artefact.link.size, sha256: artefact.link.sha256 };
}

/** A stable key for one candidate, for a list's `key` prop. */
export function candidateKey(candidate: RelinkCandidateDto): string {
  return `${candidate.location.root}:${candidate.location.path}`;
}

/** What the panel needs to offer Relink for the artefact it shows (FR-EVD-08):
 * a way to record a confirmed candidate, and the external roots a folder may
 * resolve under. Left out, Relink is not offered at all. */
export type RelinkCapability = {
  editArtefacts: RelinkEditArtefacts;
  externalRoots: string[];
};
