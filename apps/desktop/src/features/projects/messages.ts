import { assertNever } from "../../shared/assertNever";
import type { FailureReason, Warning } from "./model/flows";
import type { ReadOnlyReason } from "./model/mode";

/** User-facing text for the projects feature, in British English (AGENTS.md section 5). */
export const messages = {
  heading: "Projects",
  createHeading: "New project",
  nameLabel: "Project name",
  namePlaceholder: "For example, Batch effects in treated organoids",
  createButton: "Create project…",
  openButton: "Open project…",
  recentHeading: "Recent projects",
  noRecent: "No projects yet.",
  openRecent: "Open",
  missing: "Folder not found",
  locate: "Locate project…",
  openedHeading: "Open project",
  openedAt: "Location",
  externalRootsHeading: "External roots",
  externalRootUnresolved: "Not set on this computer",
  externalRootMissing: "Folder not found",
  chooseExternalRoot: "Choose folder…",
  working: "Working…",
  takeOver: "Take over the lock",
  tryAgain: "Try again",
  readOnlyLabel: "Read-only",
  unnamedProject: "Project file could not be read",
  unexpected: "Something unexpected happened. Try again.",
} as const;

/** One message for each reason a create, open or locate can fail. */
const failureMessages: Record<FailureReason, string> = {
  folderUnavailable:
    "That folder cannot be used. It may have been moved, renamed or removed.",
  notAProject: "That folder does not contain a Research Notebook project.",
  notebookInvalid:
    "The _notebook item in that folder is a file or a link, so nothing was written.",
  alreadyInUse:
    "That folder already contains a notebook. Choose another folder, or open it instead.",
  projectFileUnreadable:
    "The project file could not be read. Nothing was changed.",
  writeFailed:
    "The project could not be created. Some files may have been written, so check the folder before trying again.",
  notWritable:
    "This project is read-only in this window, so nothing was saved. Nothing was changed.",
  lockFailed:
    "The project lock could not be read or changed, so the project was not opened for editing.",
  fileUnavailable: "That file could not be read.",
  watchFailed:
    "Changes made outside the application may not appear until the project is reopened.",
  notRemembered: "That project is no longer in the recent list.",
  settingsDamaged:
    "The application settings file is damaged, so recent projects are unavailable. It has not been changed.",
  settingsNewer:
    "The application settings file was written by a newer version. It has not been changed.",
  settingsUnavailable:
    "The application settings file could not be read or saved.",
  internal: "Something went wrong inside the application. Try again.",
  newerFormat:
    "This project was written by a newer version of the application, so this version cannot open it.",
  invalidProject:
    "The project file is not valid, so the project cannot be opened. Nothing was changed.",
  invalidName: "Enter a project name on a single line.",
  differentProject: "That folder holds a different project.",
};

export function failureMessage(reason: FailureReason): string {
  return failureMessages[reason];
}

/** Text for something that went wrong after the project was created or opened. */
export function warningMessage(warning: Warning): string {
  switch (warning.kind) {
    case "hygieneFailed":
      return `The project was created, but ${warning.files.join(" and ")} could not be updated, so git may not treat the notebook's files as intended.`;
    case "notRemembered":
      return `The project is open, but it was not added to the recent list. ${failureMessages[warning.reason]}`;
    default:
      return assertNever(warning);
  }
}

/** A read-only banner: why the project cannot be changed, and what can be done about it (FR-PRJ-06). */
export type Banner = { reason: string; action: string };

/** `2026-09-19T10:04:00Z` as `2026-09-19 10:04 UTC`, the same wherever it is read. */
function utcMinute(timestamp: string): string {
  return `${timestamp.slice(0, 10)} ${timestamp.slice(11, 16)} UTC`;
}

const takeOverAdvice =
  "Take over the lock only if you are sure nobody else is editing this project.";

/** The banner for each reason a project is read-only. Nothing is changed on disk in any of them. */
export function readOnlyBanner(reason: ReadOnlyReason): Banner {
  switch (reason.kind) {
    case "newerFormat":
      return {
        reason:
          "This project was written by a newer version of the application, so it is open read-only.",
        action:
          "Update the application to edit it. Nothing in the project has been changed.",
      };
    case "invalidProject":
      return {
        reason:
          "The project file is not valid, so the project is open read-only.",
        action:
          "Correct _notebook/project.yaml in a text editor, then open the project again. Nothing has been changed.",
      };
    case "archived":
      return {
        reason: `This project was archived on ${utcMinute(reason.archived)}, so it is open read-only.`,
        action:
          "Archived projects cannot be edited in this version of the application.",
      };
    case "liveLock":
      return {
        reason: `Another window or computer (${reason.holder.host}) has this project open and last checked in at ${utcMinute(reason.holder.heartbeat)}, so it is open read-only.`,
        action:
          "Close the project there, then try again. Nothing here has been changed.",
      };
    case "staleLock":
      return {
        reason: `This project was last open on ${reason.holder.host}, which stopped checking in at ${utcMinute(reason.holder.heartbeat)}. The lock may have been left behind by a crash, so the project is open read-only.`,
        action: takeOverAdvice,
      };
    case "unreadableLock":
      return {
        reason:
          "The lock file in this project could not be read, so the project is open read-only.",
        action: takeOverAdvice,
      };
    case "blockedLock":
      return {
        reason:
          "The lock in this project is a folder, a link or a read-only file that the application will not replace, so the project is open read-only.",
        action:
          "Remove or rename _notebook/.lock yourself, then open the project again.",
      };
    case "readOnlyMedia":
      return {
        reason:
          "The project folder cannot be written to, so the project is open read-only.",
        action:
          "Check that the drive is not read-only and that you may change files in the folder, then try again.",
      };
    case "lockLost":
      return {
        reason:
          "Another instance took over this project, or its lock could not be kept up to date, so the project is now read-only.",
        action:
          "Close the project in the other window if it is open, then try again.",
      };
    case "lockUnavailable":
      return {
        reason:
          "The project lock could not be checked, so the project is open read-only.",
        action: "Try again. If it keeps failing, check the project folder.",
      };
    default:
      return assertNever(reason);
  }
}
