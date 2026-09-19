import { parseProject } from "@research-notebook/format";

/** What the application needs from `project.yaml` to list and open a project. */
export type ProjectSummary = {
  id: string;
  name: string;
  evidenceInGit: boolean;
  externalRoots: { id: string; label: string }[];
};

/** Why `project.yaml` could not be used. Both are reported, never repaired. */
export type OpenFailure = "newerFormat" | "invalidProject";

export type SummaryResult =
  { ok: true; value: ProjectSummary } | { ok: false; error: OpenFailure };

/**
 * Reads the text of `project.yaml` with `packages/format`, the only parser.
 * A format newer than this build is told apart from a file that is simply
 * invalid, because the remedy differs (spec 5.13).
 */
export function summariseProject(text: string): SummaryResult {
  const parsed = parseProject(text);
  if (!parsed.ok) {
    return {
      ok: false,
      error:
        parsed.error.kind === "unsupported-version"
          ? "newerFormat"
          : "invalidProject",
    };
  }
  const project = parsed.value;
  return {
    ok: true,
    value: {
      id: project.id,
      name: project.name,
      evidenceInGit: project.capture.evidence_in_git,
      externalRoots: project.external_roots.map((root) => ({
        id: root.id,
        label: root.label,
      })),
    },
  };
}

/** What a folder chosen to locate a moved project turned out to hold. */
export type LocateOutcome =
  | { kind: "match"; summary: ProjectSummary }
  | { kind: "differentProject"; summary: ProjectSummary }
  | { kind: "failed"; error: OpenFailure };

/**
 * Decides whether the folder chosen holds the project being located. The
 * identifier decides, not the name or the path, because a project keeps its
 * identifier when it is moved or renamed (FR-PRJ-03).
 */
export function locateOutcome(expectedId: string, text: string): LocateOutcome {
  const result = summariseProject(text);
  if (!result.ok) return { kind: "failed", error: result.error };
  return result.value.id === expectedId
    ? { kind: "match", summary: result.value }
    : { kind: "differentProject", summary: result.value };
}
