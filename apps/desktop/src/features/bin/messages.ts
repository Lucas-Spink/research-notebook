/** User-facing text of the Bin, in British English (AGENTS.md section 5). */
export const binMessages = {
  heading: "Bin",
  intro:
    "Questions, experiments and files you remove are kept here, not deleted. Restore puts one back where it was.",
  emptyingNote:
    "Nothing here is deleted automatically, and the application never empties the bin. To clear it, close the application and delete the .trash folder inside your project's _notebook folder yourself. Exports leave the bin out, and archives keep it.",
  loading: "Looking in the bin…",
  empty: "The bin is empty.",
  failed: "The bin could not be read. Nothing was changed.",
  refresh: "Refresh",
  restore: "Restore",
  restoreLabel: (what: string) => `Restore ${what}`,
  movedOn: (when: string) => `Moved to the bin on ${when}`,
  readOnly: "This project is read-only, so nothing can be restored.",
  list: "Items in the bin",
} as const;
