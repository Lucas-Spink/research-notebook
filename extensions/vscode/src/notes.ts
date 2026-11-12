import type { LockState } from "./lock-state";

/** What the confirmation says when the project is open in the app (FR-VSC-07). */
export const IMPORT_NOTE =
  "It imports within a couple of seconds if the project is open in Research Notebook, otherwise next time it is opened.";

/** What it says when the project is known not to be open (ADR-0069). */
const NOT_OPEN_NOTE =
  "STRATA does not have this project open; it imports when it is next opened.";

/** When the added file arrives, given what the project's lock says. */
export function arrivalNote(state: LockState): string {
  return state === "open" ? IMPORT_NOTE : NOT_OPEN_NOTE;
}
