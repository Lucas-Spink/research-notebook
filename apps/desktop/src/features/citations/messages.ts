import { assertNever } from "../../shared/assertNever";
import type { ZoteroState } from "./model/status";

/** User-facing text for the citations feature, in British English (AGENTS.md section 5). */
export const messages = {
  heading: "Zotero",
} as const;

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
