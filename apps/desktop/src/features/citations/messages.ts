import type { StyleProblem } from "@research-notebook/citations";
import { assertNever } from "../../shared/assertNever";
import type { LocatorTerm } from "./model/citationSelection";
import type { CitationSearchState } from "./model/citationSearch";
import type { ZoteroState } from "./model/status";

/** User-facing text for the citations feature, in British English (AGENTS.md section 5). */
export const messages = {
  heading: "Zotero",
} as const;

/** User-facing text for the citation picker (FR-CIT-03), in British English. */
export const citationPickerMessages = {
  slashMenuLabel: "Editor commands",
  citeItemLabel: "Cite",
  citeItemDescription: "Insert a citation from Zotero",
  dialogLabel: "Cite from Zotero",
  searchLabel: "Search your Zotero library",
  searchPlaceholder: "Search by title, author or year",
  resultsLabel: "Search results",
  idle: "Type to search your Zotero library.",
  loading: "Searching…",
  empty: "No matching sources.",
  requestError: "The search could not be completed. Try again.",
  selectedHeading: "Selected sources",
  locatorTermLabel: "Locator",
  locatorNone: "None",
  locatorValueLabel: "Locator value",
  locatorValuePlaceholder: "e.g. 6 or 10-12",
  prefixLabel: "Prefix",
  prefixPlaceholder: "e.g. see",
  suffixLabel: "Suffix",
  suffixPlaceholder: "e.g. emphasis added",
  removeSelected: "Remove from selection",
  insert: "Insert citation",
  selectedCount: (count: number) =>
    count === 1 ? "1 source selected" : `${count} sources selected`,
  noneSelected:
    "Select one or more sources. Your selection stays while you search again.",
  clearSelection: "Clear selection",
  separateLabel: "Insert as separate citations",
  separateHint: "[@a] [@b] rather than [@a; @b]",
  resultsHeading: "Search results",
  hint: "Ctrl+Enter inserts",
  replaceDialogLabel: "Replace source with a Zotero item",
  useSource: "Use this source",
  cancel: "Cancel",
} as const;

/** What the picker shows for a search state that is not a list of rows. */
export function citationSearchStatusText(
  state: Exclude<CitationSearchState, { kind: "ok" }>,
): string {
  switch (state.kind) {
    case "idle":
      return citationPickerMessages.idle;
    case "loading":
      return citationPickerMessages.loading;
    case "notRunning":
      return zoteroStatusText({ kind: "notRunning" }).label;
    case "disabled":
      return zoteroStatusText({ kind: "disabled" }).label;
    case "error":
      return citationPickerMessages.requestError;
    default:
      return assertNever(state);
  }
}

/** User-facing text for the sources list and refresh (FR-CIT-07), in British English. */
export const sourcesMessages = {
  heading: "Sources",
  refresh: "Refresh sources",
  refreshing: "Refreshing…",
  empty: "No sources are cited yet.",
  statusOk: "In Zotero",
  statusTrashed: "In the Zotero trash",
  statusMissing: "Missing from Zotero",
  mismatchHeading: "Replace data from a different Zotero?",
  replace: "Replace",
  keep: "Keep existing data",
  offlineNotRunning: "Zotero was not detected, so nothing was changed.",
  offlineDisabled:
    "Zotero's local API is switched off, so nothing was changed.",
  unreadable:
    "bibliography.json could not be read, so it was left untouched and sources were not changed.",
  notWritable: "This project is read-only, so sources were not changed.",
  changed:
    "bibliography.json changed on disk, so nothing was written. Try again.",
  failed: "Sources could not be updated. Nothing was lost; try again.",
  filterLabel: "Search sources",
  filterPlaceholder: "Title, author or citekey",
  noMatches: "No sources match.",
  attach: "Attach",
  detach: "Detach",
  attachFromZotero: "Add from Zotero…",
  attachTo: "Attaching to",
  noExperiment: "Select an experiment to attach sources to it.",
  attachFailed: "The source could not be attached. Nothing was changed.",
  detachFailed: "The source could not be detached. Nothing was changed.",
} as const;

export function attachLabel(source: string, experiment: string): string {
  return `Attach ${source} to ${experiment}`;
}

export function detachLabel(source: string, experiment: string): string {
  return `Detach ${source} from ${experiment}`;
}

/** User-facing text for the source details panel (FR-CIT-04), in British English. */
export const sourceDetailsMessages = {
  heading: "Source details",
  close: "Close source details",
  titleLabel: "Title",
  authorsLabel: "Authors",
  yearLabel: "Year",
  containerLabel: "Published in",
  doiLabel: "DOI",
  statusLabel: "State",
  openInZotero: "Open in Zotero",
  openDoi: "Open DOI",
  openPdf: "Open PDF",
  checkingPdf: "Checking Zotero for a PDF…",
  noPdf: "Zotero has no PDF for this source.",
  pdfOfflineNotRunning: "Open PDF needs Zotero, which was not detected.",
  pdfOfflineDisabled:
    "Open PDF needs Zotero's local API, which is switched off.",
  pdfFailed: "Zotero could not be asked about a PDF.",
  openFailed: "That link could not be opened.",
} as const;

/** A source's state, as the list and the citations in text say it. */
export function sourceStatusText(status: "ok" | "trashed" | "missing"): string {
  switch (status) {
    case "ok":
      return sourcesMessages.statusOk;
    case "trashed":
      return sourcesMessages.statusTrashed;
    case "missing":
      return sourcesMessages.statusMissing;
    default:
      return assertNever(status);
  }
}

/** Why the person is being asked before a source's data is replaced (FR-CIT-07). */
export function mismatchText(label: string): string {
  return `"${label}" was saved from a different Zotero than the one that is open now. Replace it with the data from this Zotero?`;
}

/** A one-line summary of a finished refresh or insert. */
export function syncSummary(counts: {
  added: number;
  updated: number;
  missing: number;
  unconfirmed: number;
  failed: number;
}): string {
  const parts = [
    counts.added > 0 ? `${counts.added} added` : null,
    counts.updated > 0 ? `${counts.updated} updated` : null,
    counts.missing > 0 ? `${counts.missing} now missing from Zotero` : null,
    counts.unconfirmed > 0
      ? `${counts.unconfirmed} could not be confirmed by Zotero; try again`
      : null,
    counts.failed > 0 ? `${counts.failed} could not be fetched` : null,
  ].filter((part): part is string => part !== null);
  return parts.length === 0
    ? "Sources are up to date."
    : `Sources: ${parts.join(", ")}.`;
}

/** The locator term option's display label; capitalised, spec 5.7's own term word otherwise. */
export function locatorTermLabel(term: LocatorTerm | null): string {
  if (term === null) return citationPickerMessages.locatorNone;
  return term.charAt(0).toUpperCase() + term.slice(1);
}

/** What the status indicator says, and how to fix it when it is not connected (FR-CIT-01). */
export type StatusText = { label: string; guidance: string | null };

const enableGuidance =
  'In Zotero, go to Settings → Advanced → General, and turn on "Allow other applications on this computer to communicate with Zotero". Then try again.';

/** The label and guidance for each Zotero connectivity state. */
export function zoteroStatusText(state: ZoteroState): StatusText {
  switch (state.kind) {
    case "connected":
      return { label: "Connected.", guidance: null };
    case "disabled":
      return {
        label: "Zotero is running, but its local API is switched off.",
        guidance: enableGuidance,
      };
    case "notRunning":
      return {
        label: "Zotero was not detected.",
        guidance:
          "Open Zotero to search and cite sources from your library. It will be detected automatically once it is running.",
      };
    case "unknown":
      return {
        label: "Zotero's status could not be checked.",
        guidance: "Try again in a moment.",
      };
    default:
      return assertNever(state);
  }
}

/** User-facing text for replacing an edited Literature block (spec 5.5 rule 6), in British English. */
export const literatureMessages = {
  heading: "Literature has been edited",
  text: "The Literature block of this experiment is not what the notebook generated, so it was probably edited by hand. Replacing it will discard those edits.",
  replace: "Replace with generated Literature",
  keep: "Keep my edits",
} as const;

/** User-facing text for choosing and importing a citation style (FR-CIT-11), in British English. */
export const styleMessages = {
  heading: "Citation style",
  selectLabel: "Style",
  currentSuffix: "(current)",
  defaultNote:
    "This project's style file is not in styles/ yet, so the numeric style is used until one is chosen.",
  importLabel: "Import a .csl file",
  working: "Changing style…",
  failed: "The style could not be changed. Nothing was lost; try again.",
  notCsl: "That file is not a CSL citation style, so it was not imported.",
  tooLarge: "That file is too large to be a citation style (over 1 MB).",
  noteStyle:
    "That is a note style, which cites in footnotes. This notebook supports only in-text styles (numbered or author-date), so it was not imported.",
  dependent:
    "That is a dependent style, which needs a parent style from the CSL repository that cannot be fetched offline. Import the parent style instead.",
  noCitation:
    "That style has no citation layout, so it cannot format citations.",
  unusable: "That style could not format a test citation, so it was not used.",
  nameTaken:
    "A different style with that file name is already in this project. Rename the file and import it again.",
} as const;

/** Why a style was refused, in words the person can act on. */
export function styleProblemText(
  problem: StyleProblem | { kind: "nameTaken" },
): string {
  switch (problem.kind) {
    case "notCsl":
      return styleMessages.notCsl;
    case "tooLarge":
      return styleMessages.tooLarge;
    case "noteStyle":
      return styleMessages.noteStyle;
    case "dependent":
      return styleMessages.dependent;
    case "noCitation":
      return styleMessages.noCitation;
    case "unusable":
      return styleMessages.unusable;
    case "nameTaken":
      return styleMessages.nameTaken;
    default:
      return assertNever(problem);
  }
}

/** The result of a successful style change, with how many hand-edited blocks were left as they were. */
export function styleChangedText(keptEdited: number): string {
  if (keptEdited === 0) {
    return "Citation style changed. Literature was regenerated.";
  }
  const blocks = keptEdited === 1 ? "block was" : "blocks were";
  return `Citation style changed. ${keptEdited} Literature ${blocks} left as edited by hand.`;
}

/** User-facing text for replacing a missing or trashed source (FR-CIT-08), in British English. */
export const repairMessages = {
  action: "Replace…",
  working: "Replacing the source…",
  notRepairable: "Only a missing or trashed source can be replaced.",
  notCited: "No experiment cites that source, so nothing was changed.",
  notUsable:
    "That item is not available in Zotero (it is missing, in the trash, or differs from the copy held), so nothing was changed.",
  failed:
    "The source could not be replaced. Some experiments may have been updated; try again to finish.",
} as const;

/** What a finished replacement did, as one status line. */
export function repairedText(experiments: number, keptEdited: number): string {
  const where =
    experiments === 1 ? "1 experiment" : `${experiments} experiments`;
  const kept =
    keptEdited === 0
      ? ""
      : keptEdited === 1
        ? " One Literature block was edited by hand and was left as it was."
        : ` ${keptEdited} Literature blocks were edited by hand and were left as they were.`;
  return `Replaced the source in ${where}.${kept}`;
}

/** User-facing text for a citation shown as an interactive reference (S6-T01), in British English. */
export const citationChipMessages = {
  publishedIn: "Published in",
  year: "Year",
  state: "State",
  clickHint: "Click to go to it in the Bibliography.",
  notCached: (citekey: string) =>
    `${citekey} is not in this project's bibliography.json yet.`,
  goTo: (label: string) => `Citation ${label}: go to it in the Bibliography`,
};
