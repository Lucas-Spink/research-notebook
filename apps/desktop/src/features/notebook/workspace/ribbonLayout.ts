/** The ribbon's tabs, in the order they are shown. */
export const RIBBON_TABS = [
  "home",
  "view",
  "sources",
  "export",
  "settings",
] as const;
export type RibbonTab = (typeof RIBBON_TABS)[number];

/** Every command the ribbon can show, each in exactly one place. */
export type CommandId =
  | "allProjects"
  | "projectControls"
  | "newQuestion"
  | "newExperiment"
  | "addResult"
  | "moveToBin"
  | "details"
  | "settingsControls"
  | "integrityCheck"
  | "sourcesPane"
  | "binPane"
  | "canvasNotesPane"
  | "search"
  | "filters"
  | "sorting"
  | "columns"
  | "density"
  | "expandAll"
  | "collapseAll"
  | "darkMode"
  | "refreshSources"
  | "attachSource"
  | "citationStyle"
  | "exportPdf"
  | "exportHtml"
  | "exportMachine"
  | "exportBundles"
  | "exportGitBundle"
  | "archiveProject";

/** A group's id doubles as the key of its label in `ribbonMessages.groups`. */
export type GroupId =
  | "project"
  | "new"
  | "selection"
  | "settings"
  | "check"
  | "panes"
  | "find"
  | "table"
  | "appearance"
  | "library"
  | "attach"
  | "citations"
  | "documents"
  | "data"
  | "packages"
  | "preserve";

export type RibbonGroupSpec = {
  group: GroupId;
  commands: readonly CommandId[];
};

/**
 * What each tab holds. A command that does not apply (no project to close,
 * nothing to archive) is simply not drawn, and a group with nothing drawn is
 * left out. Keep every command in one place only.
 */
export const RIBBON_LAYOUT: Record<RibbonTab, readonly RibbonGroupSpec[]> = {
  home: [
    { group: "project", commands: ["allProjects", "projectControls"] },
    { group: "new", commands: ["newQuestion", "newExperiment", "addResult"] },
    { group: "selection", commands: ["moveToBin", "details"] },
    { group: "panes", commands: ["sourcesPane", "binPane", "canvasNotesPane"] },
  ],
  view: [
    { group: "find", commands: ["search", "filters", "sorting"] },
    {
      group: "table",
      commands: ["columns", "density", "expandAll", "collapseAll"],
    },
    { group: "appearance", commands: ["darkMode"] },
  ],
  sources: [
    { group: "library", commands: ["refreshSources"] },
    { group: "attach", commands: ["attachSource"] },
    { group: "citations", commands: ["citationStyle"] },
  ],
  export: [
    { group: "documents", commands: ["exportPdf", "exportHtml"] },
    { group: "data", commands: ["exportMachine"] },
    { group: "packages", commands: ["exportBundles", "exportGitBundle"] },
    { group: "preserve", commands: ["archiveProject"] },
  ],
  settings: [
    { group: "settings", commands: ["settingsControls"] },
    { group: "check", commands: ["integrityCheck"] },
  ],
};
