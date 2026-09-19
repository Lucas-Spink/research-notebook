import { assertNever } from "../../shared/assertNever";
import type { FailureReason, Warning } from "./model/flows";

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
  lockFailed:
    "The project lock could not be read or changed, so the project was not opened for editing.",
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
