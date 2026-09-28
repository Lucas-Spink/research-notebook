import type { CaptureMode } from "@research-notebook/format";
import type { EvidenceFailure, Refusal } from "../../../ipc/bindings";
import { assertNever } from "../../../shared/assertNever";
import type { AddOutcome } from "./model/addEvidence";

/** Text of adding files in the Results cell (FR-EVD-01 to FR-EVD-05, ADR-0044). */
export const evidenceMessages = {
  addFiles: "Add files…",
  choosing: "Choosing files…",
  adding: "Adding files…",
  howLabel: "Add as",
  howBySize: "Copy or link by size",
  howCopy: "Always copy",
  howLink: "Always link",
  dropHint: "Drop files here to add them",
  resultsHeading: "Added",
  dismiss: "Dismiss",
  readOnly:
    "This project or experiment is read-only, so files cannot be added.",
} as const;

/** The value of the "Add as" choice: no override, or copy or link for this addition. */
export type AddHow = "size" | CaptureMode;

export const addHowOptions: { value: AddHow; label: string }[] = [
  { value: "size", label: evidenceMessages.howBySize },
  { value: "copy", label: evidenceMessages.howCopy },
  { value: "link", label: evidenceMessages.howLink },
];

/** Why a file cannot be added, in words for the person; never a path. */
export function refusalText(reason: Refusal): string {
  switch (reason.kind) {
    case "outsideRoots":
      return "it is outside the project folder and its external roots, so the notebook could not record where it came from";
    case "insideNotebook":
      return "it is inside the notebook's own folder";
    case "notAFile":
      return "it is not a file";
    case "unreadable":
      return "it could not be read";
    default:
      return assertNever(reason);
  }
}

/** Why adding a file failed. `notRecorded` is the copy that was placed but not written to artefacts.yaml. */
export function failureText(
  reason: EvidenceFailure["kind"] | "notRecorded",
): string {
  switch (reason) {
    case "projectUnavailable":
      return "the project folder could not be opened";
    case "settingsUnavailable":
      return "the application's settings could not be read";
    case "rootUnavailable":
      return "the folder it belongs to is not set on this computer";
    case "sourceUnavailable":
      return "it is no longer there";
    case "invalidRequest":
      return "its name was not acceptable";
    case "verificationFailed":
      return "the copy did not match the original, so nothing was kept";
    case "versionExists":
      return "a version with that name already exists";
    case "writeFailed":
      return "it could not be written into the notebook";
    case "internal":
      return "something unexpected happened";
    case "notRecorded":
      return "it was copied but could not be recorded, so it is not listed yet";
    default:
      return assertNever(reason);
  }
}

/** What to say when the picker could not be used. */
export function pickFailureText(reason: EvidenceFailure["kind"]): string {
  return `No files were added: ${failureText(reason)}.`;
}

/** One sentence about one file the person added. */
export function outcomeText(outcome: AddOutcome): string {
  switch (outcome.kind) {
    case "added": {
      const how = outcome.mode === "copy" ? "Copied" : "Linked";
      const warning = outcome.matchesOtherArtefact
        ? ", but the same content is already another result"
        : "";
      return `${how} ${outcome.name}${warning}.`;
    }
    case "newVersion": {
      const warning = outcome.matchesOtherArtefact
        ? ", but the same content is already another result"
        : "";
      return `${outcome.name} changed, so v${outcome.version} was added${warning}.`;
    }
    case "duplicate":
      return `${outcome.name} is unchanged since v${outcome.version}, so nothing was added.`;
    case "alreadyLinked":
      return `${outcome.name} is already linked.`;
    case "refused":
      return `${outcome.name} was not added: ${refusalText(outcome.reason)}.`;
    case "failed":
      return `${outcome.name} was not added: ${failureText(outcome.reason)}.`;
    default:
      return assertNever(outcome);
  }
}
