import type { IntegrityFinding } from "@research-notebook/format";

type Kind = IntegrityFinding["kind"];

/** Text of the integrity check (FR-ARC-01). British English, as everything the person reads. */
export const integrityMessages = {
  heading: "Integrity check",
  intro:
    "Looks for files that are missing, references that point at nothing, files kept outside the project and sources that are missing or in Zotero's bin. Nothing is changed.",
  run: "Run check",
  running: "Checking…",
  rerun: "Check again",
  notRun: "The check has not been run yet.",
  clean: "No problems found.",
  failed:
    "The check could not be completed because the captured files could not be inspected. Nothing has been changed.",
  resolve: "Resolve",
  acknowledge: "Acknowledged",
  acknowledgeHint:
    "Acknowledging is remembered until the project is closed and is not saved in the notebook.",
  sections: {
    missingFile: "Missing files",
    unresolvedReference: "Unresolved references",
    externalFile: "External files",
    sourceProblem: "Sources",
    unreadableArtefacts: "Unreadable evidence files",
  } satisfies Record<Kind, string>,
} as const;

export function summary(open: number, acknowledged: number): string {
  if (open === 0 && acknowledged === 0) return integrityMessages.clean;
  const left = `${open} to resolve or acknowledge`;
  return acknowledged === 0 ? left : `${left}, ${acknowledged} acknowledged`;
}

const availabilityText = {
  available: "available",
  missing: "not found",
  rootUnresolved: "its folder has not been set on this computer",
  rootFolderMissing: "its folder no longer exists",
  unchecked: "not checked",
} as const;

const sourceStateText = {
  trashed: "is in Zotero's bin",
  missing: "is no longer in Zotero",
  notInBibliography: "is cited but not stored in this project",
} as const;

/** One finding as a sentence. */
export function describeFinding(finding: IntegrityFinding): string {
  switch (finding.kind) {
    case "missingFile":
      return `${finding.experimentRef}: version ${finding.version} of “${finding.artefactName}” ${
        finding.unreadable ? "cannot be read" : "is missing"
      } (${finding.path.split("/").slice(3).join("/")}).`;
    case "unresolvedReference": {
      const target =
        finding.reason === "artefact"
          ? "an artefact that is no longer in the project"
          : `version ${finding.version ?? ""} of an artefact, which does not exist`;
      const maybe = finding.mayBeInUnreadableFile
        ? " An evidence file that could not be read may hold it."
        : "";
      return `${finding.experimentRef}: a reference in ${sectionName(finding.section)} points to ${target}.${maybe}`;
    }
    case "externalFile":
      return `${finding.experimentRef}: “${finding.artefactName}” is linked, not copied (${finding.path}); ${availabilityText[finding.availability]}.`;
    case "unreadableArtefacts":
      return `${finding.experimentRef}: its evidence file could not be read, so its files and references cannot be checked.`;
    case "sourceProblem": {
      const cited =
        finding.citedIn.length === 0
          ? "not cited"
          : `cited in ${finding.citedIn.join(", ")}`;
      return `${finding.citekey} ${sourceStateText[finding.state]} (${cited}).`;
    }
  }
}

function sectionName(
  section: "methods" | "results_notes" | "interpretation",
): string {
  return {
    methods: "Methods",
    results_notes: "Results notes",
    interpretation: "Interpretation",
  }[section];
}
