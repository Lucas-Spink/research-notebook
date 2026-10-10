import type { ArchiveFailure, UnarchiveFailure } from "./model/archiveProject";

/** Text of archived mode and unarchive (FR-ARC-09, FR-ARC-10). British English. */
export const archiveMessages = {
  heading: "Archive",
  introActive:
    "Archiving marks the project as finished. It then opens read-only, so nothing in it can change by accident. Only the archived mark in project.yaml is written. Run the integrity check, generate the manifest and make your exports first.",
  archive: "Archive project",
  archiving: "Archiving…",
  readOnly: "This project is read-only, so it cannot be archived.",
  archived: (when: string) => `Archived on ${when}. It opens read-only.`,
  unarchive: "Unarchive project",
  unarchiving: "Unarchiving…",
  confirmHeading: "Unarchive this project?",
  confirmBody:
    "A backup of the notebook is made first. If this version of the application needs to bring the notebook up to date, that happens now, and the project can then be edited again.",
  confirm: "Yes, unarchive",
  cancel: "Cancel",
  archiveFailures: {
    unreadable:
      "The project was not archived because project.yaml could not be read. Nothing has been changed.",
    alreadyArchived: "The project is already archived.",
    changed:
      "The project was not archived because project.yaml changed while it was being read. Nothing has been changed; try again.",
    writeFailed:
      "The project was not archived because project.yaml could not be written. Nothing has been changed.",
  } satisfies Record<ArchiveFailure, string>,
  unarchiveFailures: {
    notConfirmed: "Unarchiving needs your confirmation.",
    unreadable:
      "The project was not unarchived because project.yaml could not be read. Nothing has been changed.",
    notArchived: "The project is not archived.",
    lockUnavailable:
      "The project was not unarchived because another window or computer has it open. Nothing has been changed.",
    backupFailed:
      "The project was not unarchived because the backup could not be made. Nothing has been changed.",
    migrationNeeded:
      "The project was not unarchived because it needs bringing up to date, which this version of the application cannot do yet. Nothing has been changed.",
    changed:
      "The project was not unarchived because project.yaml changed while it was being read. Nothing has been changed; try again.",
    writeFailed:
      "The project was not unarchived because project.yaml could not be written. Nothing has been changed.",
  } satisfies Record<UnarchiveFailure, string>,
};

/** A timestamp as `2026-10-01 09:00 UTC`, the minute being as much as anyone needs. */
export function describeWhen(timestamp: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(timestamp);
  return match === null ? timestamp : `${match[1]} ${match[2]} UTC`;
}
