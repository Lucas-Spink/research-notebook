import type { Arranged } from "@research-notebook/format";
import type { FoundResult, ResultInfo } from "../../../canvas";
import { evidenceOf } from "../../model/evidence";

type Ref = { experimentId: string; artefactId: string; version?: number };

/**
 * What a canvas card points at, found again in the notebook as it is now
 * (ADR-0064): the experiment by its ULID, wherever it sits, then the artefact,
 * then the version. Whatever is not there is reported, never repaired, so the
 * card stays on the canvas saying what it lost. Nothing here reads a file.
 */
export function resolveResult(arranged: Arranged, ref: Ref): ResultInfo {
  const item = [
    ...arranged.questions.flatMap((group) => group.experiments),
    ...arranged.unassigned,
  ].find(
    (candidate) =>
      candidate.experiment.file.frontmatter.id === ref.experimentId,
  );
  if (item === undefined) return { status: "missing", reason: "experiment" };
  const artefacts = evidenceOf(item);
  const artefact = artefacts?.artefacts.find((a) => a.id === ref.artefactId);
  if (artefact === undefined) return { status: "missing", reason: "artefact" };

  const front = item.experiment.file.frontmatter;
  const common = {
    status: "found" as const,
    artefactId: artefact.id,
    name: artefact.name,
    type: artefact.type,
    experimentRef: front.ref,
    experimentTitle: front.title,
    experimentFolder: item.experiment.folder,
  };
  if (artefact.mode === "link") {
    const found: FoundResult = {
      ...common,
      mode: "link",
      shownVersion: null,
      latestVersion: null,
      fileName: artefact.source.path,
      sha256: artefact.link.sha256,
      captured: false,
    };
    return found;
  }
  const latest = Math.max(...artefact.versions.map((v) => v.v));
  const wanted = ref.version ?? latest;
  const version = artefact.versions.find((v) => v.v === wanted);
  if (version === undefined) return { status: "missing", reason: "version" };
  return {
    ...common,
    mode: "copy",
    shownVersion: version.v,
    latestVersion: latest,
    fileName: version.file,
    sha256: version.sha256,
    captured: true,
  };
}
