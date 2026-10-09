export {
  arrangeNotebook,
  type Arranged,
  type ArrangedExperiment,
  type ArrangedQuestion,
} from "./arrange";
export type { Problem } from "./problems";
export { moveExperiment, removeExperiment, removeQuestion } from "./change";
export {
  editExperiment,
  editQuestion,
  type ExperimentChanges,
  type ExperimentStatus,
} from "./edit";
export { createExperiment, createQuestion } from "./create";
export { applyCapture, type CaptureTarget, type CapturedFile } from "./capture";
export { decideCaptureMode, type CaptureMode } from "./capture-mode";
export {
  applyLink,
  applyLinkChecked,
  applyRelink,
  type LinkObservation,
  type LinkTarget,
} from "./link";
export {
  checkSourceForUpdate,
  type SourceUpdateStatus,
} from "./update-from-source";
export {
  defaultDisplayName,
  inferArtefactType,
  knownVersionsFor,
  matchInboxSource,
  planInboxImport,
  type InboxImportPlan,
  type KnownVersionInfo,
} from "./inbox";
export { capturedSourcePaths } from "./discovery";
export {
  addToGroup,
  createGroup,
  deleteGroup,
  groupLocationsOf,
  moveGroup,
  moveToGroup,
  removeFromGroup,
  renameGroup,
  reorderItem,
  ungroupedArtefacts,
} from "./groups";
export {
  editExperimentLiterature,
  editExperimentSection,
  type SectionEditOptions,
} from "./sections";
export { replaceSource, type SourceReplacement } from "./source-repair";
export {
  buildReferenceIndex,
  referencedIn,
  type ReferenceIndex,
  type ReferenceLocation,
} from "./references";
export {
  buildCitedByIndex,
  citedBy,
  type CitedByIndex,
  type CitedByLocation,
} from "./citedBy";
export { formatRef, nextRefNumber, refNumber } from "./refs";
export { artefactsOf, editArtefacts, EMPTY_ARTEFACTS } from "./artefacts-edit";
export {
  artefactsPath,
  PROJECT_PATH,
  type NotebookEnv,
  type NotebookError,
} from "./types";
export type {
  LoadedArtefacts,
  LoadedExperiment,
  LoadedQuestion,
  NotebookState,
  Plan,
  Step,
} from "./types";
export {
  cellMarkdownParts,
  summariseMarkdown,
  summariseMarkdownParts,
  type CellPart,
  type CitePart,
  type SummaryPart,
} from "./summary";
export {
  changeTableSettings,
  resetTableColumns,
  type ColumnKey,
  type TableSettingsChange,
} from "./table-settings";
export {
  citekeyOf,
  markSourceMissing,
  upsertSource,
  type FetchedSource,
  type ServerMismatch,
  type SourceChange,
} from "./sources";
export {
  changeCitationStyle,
  type CitationStyleChange,
} from "./citation-style";
export {
  buildIntegrityReport,
  linkedArtefactsOf,
  versionFilesOf,
  type IntegrityFinding,
  type IntegrityObservations,
  type LinkAvailability,
  type LinkedToCheck,
  type VersionFileToCheck,
} from "./integrity";
export { gitRepositories, type GitRepository } from "./gitRepositories";
export {
  buildManifest,
  manifestCell,
  type Manifest,
  type ManifestObservation,
  type ManifestProblem,
  type ManifestRow,
} from "./manifest";
export {
  parseManifest,
  unlistedFiles,
  type ManifestEntry,
  type ManifestParseError,
} from "./manifestParse";
export {
  htmlAssetRequests,
  renderHtmlExport,
  type ExportAsset,
  type HtmlAssetRequest,
  type HtmlExportInput,
  type HtmlPage,
} from "./htmlExport";
export {
  buildMachineExport,
  type MachineExportInput,
  type MachineFile,
} from "./machineExport";
export {
  buildPdfExport,
  projectCitationClusters,
  type PdfBibliography,
  type PdfExportFiles,
  type PdfExportInput,
} from "./pdfExport";
