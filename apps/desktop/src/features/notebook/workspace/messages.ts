/** Text of the side pane and the ribbon (S6-T01). British English, as everything the person reads. */
export const paneMessages = {
  paneLabel: "Side pane",
  tabsLabel: "Open panes",
  closePane: "Close pane",
  resizeLabel: "Resize side pane",
  sourcesTab: "Sources",
  searchTab: "Search",
  citationsTab: "Citation style",
  detailsTab: "Details",
  resultTab: "Result",
  addResultTab: "Add result",
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
    experiments: "Experiments",
    sources: "Sources",
    view: "View",
    project: "Project",
  },
  groups: {
    add: "Add",
    selection: "Selection",
    panes: "Panes",
    questions: "Questions",
    find: "Find",
    order: "Order",
    results: "Results",
    library: "Library",
    attach: "Attach",
    citations: "Citations",
    table: "Table",
    rows: "Rows",
    project: "Project",
  },
  moreActions: "More actions",
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
  expandAll: "Expand all",
  collapseAll: "Collapse all",
  search: "Search",
  sourcesPane: "Sources",
  refreshSources: "Refresh Zotero sources",
  citationStyle: "Citation style",
  changeStatus: "Change status",
  moveTo: "Move to",
  moveToNone: "Choose a question",
  details: "Details",
  noSelection: "Select an experiment first",
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
