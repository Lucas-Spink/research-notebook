import type { ZoteroConnection } from "../../../ipc/bindings";
import { assertNever } from "../../../shared/assertNever";

/**
 * Zotero's local API connectivity, as shown in the onboarding indicator
 * (FR-CIT-01). `unknown` is not a status Zotero itself reports: it is what
 * the indicator shows while nothing has been checked yet, or when a check
 * could not be completed at all.
 */
export type ZoteroState =
  | { kind: "connected" }
  | { kind: "disabled" }
  | { kind: "notRunning" }
  | { kind: "unknown" };

/** The state shown for a status the backend did manage to report. */
export function stateForConnection(connection: ZoteroConnection): ZoteroState {
  switch (connection.kind) {
    case "connected":
      return { kind: "connected" };
    case "disabled":
      return { kind: "disabled" };
    case "notRunning":
      return { kind: "notRunning" };
    default:
      return assertNever(connection);
  }
}
