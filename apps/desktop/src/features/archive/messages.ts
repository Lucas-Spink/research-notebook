import type { ManifestProblem } from "@research-notebook/format";
import type { GitBundleOutcome } from "../../ipc/bindings";
import type { ManifestFailure } from "./model/generate";
import type { GitBundleFailure } from "./model/gitBundle";
import type { HtmlExportFailure, HtmlExportOutcome } from "./model/htmlExport";
import type { PdfExportFailure } from "./model/pdfExport";
import type {
  MachineExportFailure,
  MachineExportOutcome,
} from "./model/machineExport";
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

/** Text of the git bundles (FR-ARC-04, ADR-0053). */
export const gitBundleMessages = {
  heading: "Git bundles",
  intro:
    "Optionally writes a git bundle of each repository your captured files were taken from, into exports/git/, so the exact code behind the results can be restored with git clone. A bundle holds a repository's whole committed history and can be large. Changes that were not committed when a file was captured are not in it. The repositories themselves are not changed. Git must be installed.",
  write: "Write git bundles",
  writing: "Writing…",
  again: "Write again",
  notWritten: "The git bundles have not been written yet.",
  nothingToBundle:
    "No captured file records a git repository, so there is nothing to bundle.",
  readOnly: "This project is read-only, so git bundles cannot be written.",
  repositoriesHeading: "Repositories",
  resultsHeading: "Bundles",
  failures: {
    notWritable:
      "The git bundles were not written because this project is not open for writing.",
    writeFailed:
      "The git bundles could not be written, so none can be relied on. Try again.",
  } satisfies Record<GitBundleFailure, string>,
} as const;

/** `.` is the project's own folder; anything else is shown as recorded. */
export function repositoryLabel(repo: string): string {
  return repo === "." ? "the project folder" : repo;
}

const UNITS = ["KB", "MB", "GB", "TB"] as const;

export function describeSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${UNITS[unit]}`;
}

export function bundled(done: number, total: number): string {
  return `${done} of ${plural(total, "repository", "repositories")} bundled.`;
}

export function describeBundle(
  repo: string,
  outcome: GitBundleOutcome,
): string {
  const label = repositoryLabel(repo);
  switch (outcome.kind) {
    case "written":
      return `${label}: written to ${outcome.file}${outcome.bytes === null ? "" : ` (${describeSize(outcome.bytes)})`}`;
    case "gitMissing":
      return `${label}: git is not installed or was not found, so no bundle was made`;
    case "notARepository":
      return `${label}: not the root of a git repository (it may have moved)`;
    case "noCommits":
      return `${label}: the repository has no commits, so there is nothing to bundle`;
    case "refused":
      return `${label}: not a folder inside the project, so it was skipped`;
    case "failed":
      return `${label}: git could not make a bundle; any earlier bundle was kept`;
    case "writeFailed":
      return `${label}: the bundle could not be saved in the notebook`;
  }
}

/** Text of the static HTML export (FR-ARC-05, ADR-0054). */
export const htmlExportMessages = {
  heading: "HTML export",
  intro:
    "Writes a set of static web pages into exports/html/: one for each question and experiment, with figures reduced to 800 pixels, the first rows of tables, and links to the original files. Open index.html in any browser. The pages hold no scripts and load nothing from the internet. Your captured files are not changed. Pages from an earlier export that are no longer needed are left in place.",
  write: "Write HTML export",
  writing: "Writing…",
  again: "Write again",
  notWritten: "The HTML export has not been written yet.",
  readOnly: "This project is read-only, so the HTML export cannot be written.",
  notLoaded: "The project is still loading.",
  failures: {
    filesNotPrepared:
      "The figures and tables could not be read, so nothing was written. Try again.",
    notWritable:
      "The HTML export was not written because this project is not open for writing.",
    writeFailed:
      "The HTML export could not be written, so it cannot be relied on. Try again.",
  } satisfies Record<HtmlExportFailure, string>,
} as const;

export function exported(outcome: HtmlExportOutcome): string {
  const pages = plural(outcome.pages, "page", "pages");
  return `${pages} written to exports/html/. Open index.html to start.`;
}

export function notPreparedNote(count: number): string {
  return `${plural(count, "figure or table", "figures and tables")} could not be reduced or sampled, so ${count === 1 ? "its page links" : "their pages link"} the original file only.`;
}

export function failedPagesNote(names: readonly string[]): string {
  return `These pages could not be written and are as they were before: ${names.join(", ")}.`;
}

/** Text of the machine-readable export (FR-ARC-07, ADR-0055). */
export const machineExportMessages = {
  heading: "Machine-readable export",
  intro:
    "Writes notebook.json into exports/machine/, with the JSON Schemas it follows and a Markdown file for each question and experiment, so the notebook can be read by other programs and without this application. Your captured files are not changed. Files from an earlier export that are no longer needed are left in place.",
  write: "Write machine-readable export",
  writing: "Writing�",
  again: "Write again",
  notWritten: "The machine-readable export has not been written yet.",
  readOnly:
    "This project is read-only, so the machine-readable export cannot be written.",
  notLoaded: "The project is still loading.",
  failures: {
    notWritable:
      "The machine-readable export was not written because this project is not open for writing.",
    writeFailed:
      "The machine-readable export could not be written, so it cannot be relied on. Try again.",
  } satisfies Record<MachineExportFailure, string>,
} as const;

export function machineExported(outcome: MachineExportOutcome): string {
  const files = plural(outcome.files, "file", "files");
  return `${files} written to exports/machine/. Open notebook.json to start.`;
}

export function failedFilesNote(names: readonly string[]): string {
  return `These files could not be written and are as they were before: ${names.join(", ")}.`;
}

/** Text of the PDF/A export (FR-ARC-06, ADR-0056). */
export const pdfExportMessages = {
  heading: "PDF/A export",
  intro:
    "Writes exports/pdf/project.pdf, a single archival PDF/A-3b document with every question, experiment, section and artefact listed, and one bibliography of every source cited anywhere in the project. notebook.json and bibliography.json are attached inside it. Figures are not included; artefacts are listed with their versions and checksums. Your captured files are not changed.",
  write: "Write PDF/A export",
  writing: "Writing�",
  again: "Write again",
  notWritten: "The PDF/A export has not been written yet.",
  readOnly: "This project is read-only, so the PDF/A export cannot be written.",
  notLoaded: "The project is still loading.",
  exported: "PDF written to exports/pdf/project.pdf.",
  failures: {
    filesNotRead:
      "The PDF/A export was not written because the project's sources could not be read. Try again.",
    bibliographyFailed:
      "The PDF/A export was not written because the bibliography could not be formatted with the project's citation style.",
    notBuilt:
      "The PDF/A export could not be built from this project, so nothing was written.",
    notWritable:
      "The PDF/A export was not written because this project is not open for writing.",
    writeFailed:
      "The PDF/A export could not be written, so it cannot be relied on. Try again.",
  } satisfies Record<PdfExportFailure, string>,
} as const;
