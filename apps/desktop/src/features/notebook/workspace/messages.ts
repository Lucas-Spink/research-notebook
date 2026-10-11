/** Text of the side pane and the ribbon (S6-T01). British English, as everything the person reads. */
export const paneMessages = {
  paneLabel: "Side pane",
  tabsLabel: "Open panes",
  closePane: "Close pane",
  minimisePane: "Minimise the side pane",
  restorePane: "Show the side pane",
  railLabel: "Minimised panes",
  resizeLabel: "Resize side pane",
  sourcesTab: "Sources",
  searchTab: "Search",
  citationsTab: "Citation style",
  detailsTab: "Details",
  integrityTab: "Integrity check",
  binTab: "Bin",
  exportTabs: {
    pdf: "PDF/A export",
    html: "HTML export",
    machine: "Machine-readable export",
    bundles: "Bundles",
    gitBundle: "Git bundles",
    archive: "Archive",
  },
  resultTab: "Result",
  addResultTab: "Add result",
  resultsTab: "Results",
  noSelection: "Select a question or experiment to see its details.",
  resultUnavailable: "This result is no longer in the experiment.",
};

export function closeTabLabel(title: string): string {
  return `Close ${title}`;
}

export const ribbonMessages = {
  label: "Ribbon",
  tabsLabel: "Ribbon tabs",
  collapse: "Collapse the ribbon",
  expand: "Expand the ribbon",
  tabs: {
    home: "Home",
    view: "View",
    sources: "Sources",
    export: "Export",
    settings: "Settings",
  },
  groups: {
    project: "Project",
    new: "New",
    selection: "Selection",
    settings: "Settings",
    check: "Check",
    panes: "Panes",
    find: "Find",
    table: "Table",
    appearance: "Appearance",
    library: "Library",
    attach: "Attach",
    citations: "Citations",
    documents: "Documents",
    data: "Data",
    packages: "Packages",
    preserve: "Preserve",
  },
  /** Shown as the hint on every command that needs a selection and has none. */
  selectionHint: "Select a question or experiment",
  newQuestion: "New question",
  newExperiment: "New experiment",
  newExperimentQuestion: "Question",
  newExperimentTitle: "Experiment title",
  addExperimentSubmit: "Add experiment",
  addResult: "Add result",
  attachSource: "Attach source",
  filters: "Filters",
  sorting: "Sorting",
  columns: "Columns",
  compactOverview: "Compact overview",
  detailedComparison: "Detailed comparison",
  allProjects: "‹ All projects",
  darkMode: "Dark mode",
  expandAll: "Expand all",
  collapseAll: "Collapse all",
  search: "Search",
  sourcesPane: "Sources",
  refreshSources: "Refresh Zotero sources",
  citationStyle: "Citation style",
  integrityCheck: "Integrity check",
  binPane: "Bin",
  exportPdf: "PDF/A",
  exportHtml: "HTML",
  exportMachine: "Machine-readable",
  exportBundles: "Bundles",
  exportGitBundle: "Git bundle",
  archiveProject: "Archive project",
  details: "Details",
  problems: (count: number) =>
    count === 1 ? "1 problem" : `${count} problems`,
};

/** Text of the Bibliography below the table (S6-T01). */
export const bibliographyMessages = {
  heading: "Bibliography",
  empty: "No sources are cited in this project yet.",
  details: "Details",
  detailsLabel: (entry: string) => `Show details of ${entry}`,
  notCached: (citekey: string) => `${citekey} (not in bibliography.json)`,
};

/** Text of the Add result pane (S6-T01). */
export const addResultMessages = {
  heading: (ref: string) => `Add results to ${ref}`,
  intro:
    "Copy keeps a version of each file inside the project. Link records where the file lives and checks it later.",
  unavailable: "This experiment's results cannot be changed.",
};

/** Text of the Results browser (S6-T01). */
export const resultsBrowserMessages = {
  heading: (ref: string) => `Results of ${ref}`,
  addResults: "Add results…",
  hint: "Drag a file onto a group to move it, or use its ⋯ button. Double-click a file to open it.",
  codeFolder: "Code",
  codeCount: (count: number) => (count === 1 ? "1 script" : `${count} scripts`),
  codeEmpty:
    "No scripts yet. Add one here to preview it, and text can refer to it as it can to a figure.",
  addScript: "Add script…",
  removeScriptWarning:
    "This script is moved to the bin and can be restored. A file stored outside the notebook is not touched.",
  scriptOpen: (name: string) => `Open ${name}`,
  linked: "linked",
};

/** Text of the project header: breadcrumbs, key figures and the main action (issue #101). */
export const headerMessages = {
  breadcrumbs: "Where you are",
  projects: "Projects",
  summaryLabel: "Project summary",
  experiments: (n: number) => (n === 1 ? "1 experiment" : `${n} experiments`),
  results: (n: number) => (n === 1 ? "1 result" : `${n} results`),
  references: (n: number) => (n === 1 ? "1 reference" : `${n} references`),
  integrity: {
    idle: "Integrity not checked",
    running: "Checking integrity…",
    failed: "Integrity check could not run",
    clean: "Integrity OK",
    issues: (n: number) =>
      n === 1 ? "Integrity: 1 issue" : `Integrity: ${n} issues`,
  },
  readOnly: "Read-only",
  archived: "Archived",
};
