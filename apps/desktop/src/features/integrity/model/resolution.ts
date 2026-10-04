import type { IntegrityFinding } from "@research-notebook/format";

/**
 * Where a finding can be put right, using what already exists (FR-ARC-01):
 * the experiment's Results, the experiment's text, or the Sources list.
 * `null` means there is nothing to do but acknowledge it.
 */
export type Resolution = "results" | "experiment" | "source";

export function resolutionOf(finding: IntegrityFinding): Resolution | null {
  switch (finding.kind) {
    case "missingFile":
      return "results";
    case "externalFile":
      // A linked file that is there needs nothing; one that is not is relinked in Results.
      return finding.availability === "available" ||
        finding.availability === "unchecked"
        ? null
        : "results";
    case "unresolvedReference":
      return "experiment";
    case "sourceProblem":
      return "source";
    case "unreadableArtefacts":
      return null;
  }
}
