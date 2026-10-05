import type { ManifestProblem } from "@research-notebook/format";
import type { ManifestFailure } from "./model/generate";
import type { VerifyFailure, VerifyFinding } from "./model/verify";

/** Text of the manifest (FR-ARC-02). British English, as everything the person reads. */
export const manifestMessages = {
  heading: "Manifest",
  intro:
    "Writes exports/manifest.csv, listing every file captured into the notebook with its size, modification time and SHA-256, the experiments that hold it and its groups. Linked files are outside the notebook and are not listed. Nothing else is changed.",
  generate: "Generate manifest",
  generating: "Writing…",
  again: "Generate again",
  notGenerated: "The manifest has not been generated yet.",
  readOnly: "This project is read-only, so the manifest cannot be written.",
  integrityNotRun:
    "The integrity check has not been run. Run it first to see what the manifest cannot cover.",
  problemsHeading: "Files to look at",
  failures: {
    filesNotChecked:
      "The manifest was not written because the captured files could not be inspected. Nothing has been changed.",
    notWritable:
      "The manifest was not written because this project is not open for writing.",
    writeFailed: "The manifest could not be written. Nothing was changed.",
  } satisfies Record<ManifestFailure, string>,
} as const;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export function written(files: number): string {
  return `Manifest written with ${plural(files, "file", "files")}.`;
}

export function integrityOpen(open: number): string | null {
  return open === 0
    ? null
    : `The integrity check has ${plural(open, "finding", "findings")} still to resolve or acknowledge.`;
}

const problemText = {
  missing: "not found, so it is not listed",
  unreadable: "could not be read, so it is not listed",
  differs:
    "differs from the notebook's record; the manifest lists the file as it is now",
} satisfies Record<ManifestProblem["kind"], string>;

export function describeProblem(problem: ManifestProblem): string {
  return `${problem.path} (${problem.experiment}): ${problemText[problem.kind]}`;
}

/** Text of Verify (FR-ARC-03). */
export const verifyMessages = {
  heading: "Verify",
  intro:
    "Re-hashes every file listed in exports/manifest.csv and reports any that are missing or no longer match. Nothing is changed. Linked files are outside the notebook and are not checked.",
  verify: "Verify files",
  verifying: "Verifying…",
  again: "Verify again",
  notRun: "The files have not been verified yet.",
  clean: "Every listed file matches the manifest.",
  findingsHeading: "Files that do not match",
  unlistedHeading: "Captured files not in the manifest",
  unlistedNote:
    "These were captured after the manifest was made, so Verify cannot vouch for them. Generate the manifest again to include them.",
  failures: {
    noManifest: "There is no manifest to verify against. Generate it first.",
    manifestUnreadable:
      "The manifest could not be read, so nothing has been verified.",
    manifestMalformed:
      "The manifest is not in the form this application writes, so nothing has been verified. Generate it again.",
    filesNotChecked:
      "The files could not be inspected, so nothing has been verified.",
  } satisfies Record<VerifyFailure, string>,
} as const;

export function verified(files: number): string {
  return `${plural(files, "file", "files")} checked.`;
}

export function describeFinding(finding: VerifyFinding): string {
  switch (finding.kind) {
    case "missing":
      return `${finding.path}: not found`;
    case "unreadable":
      return `${finding.path}: could not be read`;
    case "changed":
      return `${finding.path}: ${finding.sizeChanged ? "the size and contents differ" : "the contents differ"} from the manifest`;
  }
}
