/**
 * Every word the static HTML export adds to the researcher's own text. The
 * export is a document that outlives the application, so its wording is fixed
 * here, in British English, and not taken from the interface's message files.
 */
export const HTML_EXPORT_TEXT = {
  project: "Project",
  questions: "Questions",
  experiments: "Experiments",
  noQuestion: "Experiments without a question",
  notExported: "Not exported",
  notExportedWhy:
    "Another question or experiment has the same ID or reference, so this one was left out.",
  motivation: "Motivation",
  question: "Question",
  status: "Status",
  started: "Started",
  completed: "Completed",
  methods: "Methods",
  resultsNotes: "Results notes",
  interpretation: "Interpretation",
  literature: "Literature",
  artefacts: "Artefacts",
  resultFiles: "Results",
  methodFiles: "Methods files",
  ungrouped: "Not in a group",
  unreadable: "Artefacts could not be read, so none are listed here.",
  noPreview: "Preview not available.",
  moreRows:
    "Only the first rows are shown. The whole table is in the original file.",
  moreColumns: "Only the first columns are shown.",
  original: "Original file",
  linked: "Linked file, not copied into the notebook",
  captured: "captured",
  bytes: "bytes",
  version: "Version",
  rows: "rows",
  generated:
    "Static export of the notebook. Figures are reduced copies; links lead to the original files.",
} as const;
