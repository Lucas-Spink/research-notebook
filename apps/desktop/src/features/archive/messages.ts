import type { ManifestProblem } from "@research-notebook/format";
import type { ManifestFailure } from "./model/generate";

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
