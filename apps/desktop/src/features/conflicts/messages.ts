/** User-facing text for the conflicts feature, in British English (AGENTS.md section 5). */
export const messages = {
  heading: "This file changed on disk",
  intro:
    "It was changed outside the application while you had unsaved changes. Both versions are kept until you choose.",
  fileLabel: "File",
  mineHeading: "Your unsaved version",
  theirsHeading: "Version on disk",
  theirsLoading: "Reading the version on disk…",
  theirsMissing: "The file was removed from disk.",
  emptyText: "(empty)",
  keepMine: "Keep my version",
  keepMineHint: "Saving it replaces the version on disk.",
  useTheirs: "Use the version on disk",
  useTheirsHint: "Your unsaved changes are discarded.",
  acceptRemoval: "Accept the removal",
  acceptRemovalHint:
    "Your unsaved changes are discarded and the file stays removed.",
  panelLabel: "Files changed outside the application",
} as const;
