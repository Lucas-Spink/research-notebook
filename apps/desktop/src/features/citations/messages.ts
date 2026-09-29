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
