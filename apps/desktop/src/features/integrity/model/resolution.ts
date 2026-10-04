import type {
  IntegrityFinding,
  RecognisedSectionKey,
} from "@research-notebook/format";

/**
 * Where a finding can be put right, using what already exists (FR-ARC-01):
 * an experiment's Results (relink, replace), its text (update the reference)
 * or the Sources list (repair, refresh).
 */
export type ResolveTarget =
  | { kind: "results"; experimentFolder: string }
  | {
      kind: "experiment";
      experimentFolder: string;
      section: RecognisedSectionKey;
    }
  | { kind: "source"; citekey: string };

/** Where to take the person for `finding`, or `null` when it can only be acknowledged. */
export function resolveTargetOf(
  finding: IntegrityFinding,
): ResolveTarget | null {
  switch (finding.kind) {
    case "missingFile":
      return { kind: "results", experimentFolder: finding.experimentFolder };
    case "externalFile":
      // A linked file that is there needs nothing; one that is not is relinked in Results.
      return finding.availability === "available" ||
        finding.availability === "unchecked"
        ? null
        : { kind: "results", experimentFolder: finding.experimentFolder };
    case "unresolvedReference":
      return {
        kind: "experiment",
        experimentFolder: finding.experimentFolder,
        section: finding.section,
      };
    case "sourceProblem":
      return { kind: "source", citekey: finding.citekey };
    case "unreadableArtefacts":
      return null;
  }
}
